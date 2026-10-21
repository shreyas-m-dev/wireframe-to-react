'use strict';

/**
 * Forward/backward SQL migration runner.
 *
 * Files: backend/db/migrations/NNNN_name.up.sql and NNNN_name.down.sql.
 * Applied versions are recorded in app_meta.schema_migrations with a SHA-256
 * of the up script; editing an applied migration is refused. Each migration
 * runs in its own transaction under a transaction-scoped advisory lock, so two
 * deploys migrating at once cannot both apply the same step.
 *
 * CLI: node src/db/migrate.js up            apply all pending
 *      node src/db/migrate.js down          revert the latest applied
 *      node src/db/migrate.js down --steps 2
 *      node src/db/migrate.js status
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '../../db/migrations');
const LOCK_KEY = 74_201_337; // arbitrary constant shared by every runner

function loadMigrations(dir = MIGRATIONS_DIR) {
  const byVersion = new Map();
  for (const file of fs.readdirSync(dir)) {
    const match = /^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$/.exec(file);
    if (!match) continue;
    const [, version, name, direction] = match;
    const entry = byVersion.get(version) || { version, name };
    entry[direction] = fs.readFileSync(path.join(dir, file), 'utf8');
    byVersion.set(version, entry);
  }
  const migrations = [...byVersion.values()].sort((a, b) => a.version.localeCompare(b.version));
  for (const migration of migrations) {
    if (!migration.up || !migration.down) throw new Error(`Migration ${migration.version}_${migration.name} needs both .up.sql and .down.sql`);
    migration.checksum = crypto.createHash('sha256').update(migration.up).digest('hex');
  }
  return migrations;
}

async function ensureMetaTable(db) {
  await db.exec(`
    create schema if not exists app_meta;
    create table if not exists app_meta.schema_migrations (
      version     text primary key,
      name        text not null,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    );
    alter table app_meta.schema_migrations enable row level security;
  `);
}

async function appliedMigrations(db) {
  await ensureMetaTable(db);
  const { rows } = await db.query('select version, name, checksum from app_meta.schema_migrations order by version');
  return rows;
}

async function migrateUp(db, { dir, log = () => {} } = {}) {
  const migrations = loadMigrations(dir);
  const applied = new Map((await appliedMigrations(db)).map((row) => [row.version, row]));
  for (const row of applied.values()) {
    const local = migrations.find((m) => m.version === row.version);
    if (!local) throw new Error(`Database has migration ${row.version}_${row.name} that is missing locally`);
    if (local.checksum !== row.checksum) throw new Error(`Migration ${row.version}_${row.name} was modified after it was applied`);
  }
  const done = [];
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    const ran = await db.transaction(async (tx) => {
      await tx.query('select pg_advisory_xact_lock($1)', [LOCK_KEY]);
      const { rows } = await tx.query('select 1 from app_meta.schema_migrations where version = $1', [migration.version]);
      if (rows.length) return false; // another runner applied it while we waited
      await tx.exec(migration.up);
      await tx.query('insert into app_meta.schema_migrations (version, name, checksum) values ($1, $2, $3)', [migration.version, migration.name, migration.checksum]);
      return true;
    });
    if (ran) { done.push(migration.version); log(`applied ${migration.version}_${migration.name}`); }
  }
  return done;
}

async function migrateDown(db, { dir, steps = 1, log = () => {} } = {}) {
  const migrations = loadMigrations(dir);
  const applied = (await appliedMigrations(db)).reverse().slice(0, steps);
  const reverted = [];
  for (const row of applied) {
    const migration = migrations.find((m) => m.version === row.version);
    if (!migration) throw new Error(`No local down script for applied migration ${row.version}_${row.name}`);
    await db.transaction(async (tx) => {
      await tx.query('select pg_advisory_xact_lock($1)', [LOCK_KEY]);
      await tx.exec(migration.down);
      await tx.query('delete from app_meta.schema_migrations where version = $1', [row.version]);
    });
    reverted.push(row.version);
    log(`reverted ${row.version}_${row.name}`);
  }
  return reverted;
}

/** Throws unless every local migration is applied (checked at server boot). */
async function assertUpToDate(db, { dir } = {}) {
  const migrations = loadMigrations(dir);
  const applied = new Set((await appliedMigrations(db)).map((row) => row.version));
  const pending = migrations.filter((m) => !applied.has(m.version));
  if (pending.length) throw new Error(`Database has ${pending.length} pending migration(s): ${pending.map((m) => `${m.version}_${m.name}`).join(', ')}. Run \`npm run migrate\`.`);
}

async function main() {
  const { loadConfig } = require('../config');
  const { createPgDatabase } = require('./index');
  const [command = 'status', ...rest] = process.argv.slice(2);
  const stepsIndex = rest.indexOf('--steps');
  const steps = stepsIndex >= 0 ? Number(rest[stepsIndex + 1]) : 1;
  const db = createPgDatabase(loadConfig());
  try {
    if (command === 'up') {
      const done = await migrateUp(db, { log: console.log });
      console.log(done.length ? `${done.length} migration(s) applied` : 'database is up to date');
    } else if (command === 'down') {
      if (!Number.isInteger(steps) || steps < 1) throw new Error('--steps must be a positive integer');
      await migrateDown(db, { steps, log: console.log });
    } else if (command === 'status') {
      const applied = new Set((await appliedMigrations(db)).map((row) => row.version));
      for (const m of loadMigrations()) console.log(`${applied.has(m.version) ? 'applied ' : 'pending '} ${m.version}_${m.name}`);
    } else {
      throw new Error(`unknown command: ${command}`);
    }
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { loadMigrations, migrateUp, migrateDown, assertUpToDate, appliedMigrations };
