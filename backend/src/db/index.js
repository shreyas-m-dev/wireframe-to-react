'use strict';

/**
 * Database access. Production uses node-postgres against Supabase Postgres;
 * tests use PGlite (real Postgres compiled to WASM, in-process). Both are
 * wrapped in the same small interface so repositories never know which:
 *
 *   query(text, params)  -> { rows, rowCount }
 *   exec(sql)            -> runs a multi-statement script (migrations)
 *   transaction(fn)      -> fn receives { query, exec }; commits or rolls back
 *   ping()               -> throws if the database is unreachable
 *   close()
 */

const fs = require('fs');

function sslOptions(config) {
  if (config.databaseSsl === 'disable') return false;
  if (config.databaseSsl === 'verify') return { rejectUnauthorized: true, ca: fs.readFileSync(config.databaseSslCa, 'utf8') };
  // 'require': encrypted but unverified. Allowed outside production only.
  return { rejectUnauthorized: false };
}

function createPgDatabase(config, logger) {
  const { Pool } = require('pg');
  // sslmode in the URL would override the explicit ssl option; strip it so
  // DATABASE_SSL is the single source of truth.
  const url = new URL(config.databaseUrl);
  url.searchParams.delete('sslmode');
  const pool = new Pool({
    connectionString: url.toString(),
    ssl: sslOptions(config),
    max: config.databasePoolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
    application_name: 'wireframe-to-react-api',
  });
  pool.on('error', (error) => logger?.error('db.pool_error', { message: error.message }));

  const wrap = (client) => ({
    query: async (text, params = []) => {
      const result = await client.query(text, params);
      return { rows: result.rows, rowCount: result.rowCount };
    },
    exec: async (sql) => { await client.query(sql); },
  });

  return {
    kind: 'pg',
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async ping() { await pool.query('select 1'); },
    async close() { await pool.end(); },
  };
}

/** In-process Postgres for tests and local experiments. */
async function createPgliteDatabase() {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  await pg.waitReady;
  const wrap = (handle) => ({
    query: async (text, params = []) => {
      const result = await handle.query(text, params);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    },
    exec: async (sql) => { await handle.exec(sql); },
  });
  return {
    kind: 'pglite',
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    async ping() { await pg.query('select 1'); },
    async close() { await pg.close(); },
  };
}

module.exports = { createPgDatabase, createPgliteDatabase };
