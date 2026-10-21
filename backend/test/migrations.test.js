'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createPgliteDatabase } = require('../src/db');
const { migrateUp, migrateDown, assertUpToDate, appliedMigrations } = require('../src/db/migrate');

const AUTH_STUB = fs.readFileSync(path.join(__dirname, 'fixtures/supabase_auth_stub.sql'), 'utf8');

test('migrations apply, revert and re-apply cleanly (up → down → up)', async () => {
  const db = await createPgliteDatabase();
  try {
    await db.exec(AUTH_STUB);
    await assert.rejects(assertUpToDate(db), /pending migration/);
    const applied = await migrateUp(db);
    assert.ok(applied.includes('0001'));
    await assertUpToDate(db);
    assert.deepStrictEqual(await migrateUp(db), [], 'second run is a no-op');

    const tables = async () => (await db.query("select table_name from information_schema.tables where table_schema = 'app' order by 1")).rows.map((r) => r.table_name);
    assert.deepStrictEqual(await tables(), ['artifacts', 'job_results', 'jobs', 'projects']);

    const rls = await db.query("select relname, relrowsecurity from pg_class where relnamespace = 'app'::regnamespace and relkind = 'r' order by 1");
    assert.ok(rls.rows.every((r) => r.relrowsecurity), 'every app table has RLS enabled');

    assert.deepStrictEqual(await migrateDown(db), ['0001']);
    assert.deepStrictEqual(await tables(), []);
    assert.deepStrictEqual(await appliedMigrations(db), []);

    assert.deepStrictEqual(await migrateUp(db), ['0001']);
    assert.strictEqual((await tables()).length, 4);
  } finally {
    await db.close();
  }
});

test('an applied migration that was edited afterwards is refused', async () => {
  const db = await createPgliteDatabase();
  try {
    await db.exec(AUTH_STUB);
    await migrateUp(db);
    await db.query("update app_meta.schema_migrations set checksum = repeat('0', 64) where version = '0001'");
    await assert.rejects(migrateUp(db), /modified after it was applied/);
  } finally {
    await db.close();
  }
});

test('schema enforces ownership consistency between projects and jobs', async () => {
  const db = await createPgliteDatabase();
  try {
    await db.exec(AUTH_STUB);
    await migrateUp(db);
    const alice = '11111111-1111-4111-8111-111111111111';
    const mallory = '22222222-2222-4222-8222-222222222222';
    await db.query('insert into auth.users (id) values ($1), ($2)', [alice, mallory]);
    const { rows: [project] } = await db.query("insert into app.projects (owner_id, name) values ($1, 'Alice') returning id", [alice]);
    // A job row claiming Mallory's ownership of Alice's project is rejected by the composite FK.
    await assert.rejects(db.query(
      "insert into app.jobs (project_id, owner_id, source_filename, source_mime, source_bytes, source_sha256) values ($1, $2, 'a.png', 'image/png', 1, repeat('a', 64))",
      [project.id, mallory],
    ), /foreign key/);
    // Deleting the user cascades to their projects.
    await db.query('delete from auth.users where id = $1', [alice]);
    assert.strictEqual((await db.query('select count(*)::int as n from app.projects')).rows[0].n, 0);
  } finally {
    await db.close();
  }
});
