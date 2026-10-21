'use strict';

/**
 * Data access. Every user-facing read and write takes the caller's ownerId and
 * filters on it in SQL, so object-level authorization is enforced by the query
 * itself: a row owned by someone else is indistinguishable from a missing row.
 * Functions suffixed `Internal` are for the job runner only (no ownerId),
 * and are never reachable from a route with a user-supplied id.
 */

const { UUID } = require('../config');

const ACTIVE = ['queued', 'running'];
const JOB_COLUMNS = `id, project_id, owner_id, parent_job_id, status, stage, instructions, source_filename, source_mime,
  source_bytes, source_sha256, source_path, gen_mode, schema_source, error_code, error_message, created_at, updated_at,
  started_at, finished_at`;

const isUuid = (value) => typeof value === 'string' && UUID.test(value);

function encodeCursor(row) {
  return Buffer.from(`${new Date(row.created_at ?? row.updated_at).toISOString()}|${row.id}`).toString('base64url');
}
function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const [at, id] = Buffer.from(String(cursor), 'base64url').toString('utf8').split('|');
    if (!isUuid(id) || Number.isNaN(Date.parse(at))) return null;
    return { at, id };
  } catch { return null; }
}
function clampLimit(limit, fallback = 20) {
  const n = Number(limit);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : fallback;
}

function createRepositories(db) {
  const projects = {
    async list(ownerId, { limit, cursor } = {}) {
      const size = clampLimit(limit);
      const after = decodeCursor(cursor);
      const { rows } = await db.query(
        `select id, name, created_at, updated_at from app.projects
          where owner_id = $1 and ($2::timestamptz is null or (updated_at, id) < ($2::timestamptz, $3::uuid))
          order by updated_at desc, id desc limit $4`,
        [ownerId, after?.at ?? null, after?.id ?? null, size + 1],
      );
      const page = rows.slice(0, size);
      return { items: page, nextCursor: rows.length > size ? encodeCursor({ ...page[page.length - 1], created_at: page[page.length - 1].updated_at }) : null };
    },
    async create(ownerId, name) {
      const { rows } = await db.query('insert into app.projects (owner_id, name) values ($1, $2) returning id, name, created_at, updated_at', [ownerId, name]);
      return rows[0];
    },
    async get(ownerId, id) {
      if (!isUuid(id)) return null;
      const { rows } = await db.query('select id, name, created_at, updated_at from app.projects where id = $1 and owner_id = $2', [id, ownerId]);
      return rows[0] || null;
    },
    async rename(ownerId, id, name) {
      if (!isUuid(id)) return null;
      const { rows } = await db.query('update app.projects set name = $3 where id = $1 and owner_id = $2 returning id, name, created_at, updated_at', [id, ownerId, name]);
      return rows[0] || null;
    },
    /** Deletes the project (jobs cascade) and returns blob paths to remove. */
    async remove(ownerId, id) {
      if (!isUuid(id)) return null;
      return db.transaction(async (tx) => {
        const { rows: jobs } = await tx.query('select id, source_path from app.jobs where project_id = $1 and owner_id = $2', [id, ownerId]);
        const { rowCount } = await tx.query('delete from app.projects where id = $1 and owner_id = $2', [id, ownerId]);
        return rowCount ? { jobIds: jobs.map((j) => j.id), sourcePaths: jobs.map((j) => j.source_path).filter(Boolean) } : null;
      });
    },
  };

  const jobs = {
    /**
     * Creates a queued job. With an idempotency key, a retried request returns
     * the job created the first time instead of starting a second run.
     */
    async create(ownerId, fields) {
      const values = [fields.projectId, ownerId, fields.parentJobId || null, fields.instructions || '', fields.sourceFilename,
        fields.sourceMime, fields.sourceBytes, fields.sourceSha256, fields.genMode || null, fields.idempotencyKey || null];
      const { rows } = await db.query(
        `insert into app.jobs (project_id, owner_id, parent_job_id, instructions, source_filename, source_mime, source_bytes,
           source_sha256, gen_mode, idempotency_key)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (owner_id, idempotency_key) do nothing
         returning ${JOB_COLUMNS}`,
        values,
      );
      if (rows[0]) return { job: rows[0], created: true };
      const existing = await db.query(`select ${JOB_COLUMNS} from app.jobs where owner_id = $1 and idempotency_key = $2`, [ownerId, fields.idempotencyKey]);
      return { job: existing.rows[0], created: false };
    },
    async get(ownerId, id) {
      if (!isUuid(id)) return null;
      const { rows } = await db.query(`select ${JOB_COLUMNS} from app.jobs where id = $1 and owner_id = $2`, [id, ownerId]);
      return rows[0] || null;
    },
    async findByIdempotencyKey(ownerId, key) {
      const { rows } = await db.query(`select ${JOB_COLUMNS} from app.jobs where owner_id = $1 and idempotency_key = $2`, [ownerId, key]);
      return rows[0] || null;
    },
    async listByProject(ownerId, projectId, { limit, cursor } = {}) {
      if (!isUuid(projectId)) return { items: [], nextCursor: null };
      const size = clampLimit(limit);
      const after = decodeCursor(cursor);
      const { rows } = await db.query(
        `select ${JOB_COLUMNS} from app.jobs
          where owner_id = $1 and project_id = $2
            and ($3::timestamptz is null or (created_at, id) < ($3::timestamptz, $4::uuid))
          order by created_at desc, id desc limit $5`,
        [ownerId, projectId, after?.at ?? null, after?.id ?? null, size + 1],
      );
      const page = rows.slice(0, size);
      return { items: page, nextCursor: rows.length > size ? encodeCursor(page[page.length - 1]) : null };
    },
    async countActive(ownerId) {
      const { rows } = await db.query('select count(*)::int as n from app.jobs where owner_id = $1 and status = any($2)', [ownerId, ACTIVE]);
      return rows[0].n;
    },
    async countSince(ownerId, since) {
      const { rows } = await db.query('select count(*)::int as n from app.jobs where owner_id = $1 and created_at >= $2', [ownerId, since]);
      return rows[0].n;
    },
    async remove(ownerId, id) {
      if (!isUuid(id)) return null;
      const { rows } = await db.query('delete from app.jobs where id = $1 and owner_id = $2 returning id, source_path', [id, ownerId]);
      return rows[0] || null;
    },

    async getInternal(id) {
      const { rows } = await db.query(`select ${JOB_COLUMNS} from app.jobs where id = $1`, [id]);
      return rows[0] || null;
    },
    async updateInternal(id, patch) {
      const allowed = ['status', 'stage', 'source_path', 'gen_mode', 'schema_source', 'error_code', 'error_message', 'started_at', 'finished_at'];
      const keys = Object.keys(patch).filter((key) => allowed.includes(key));
      if (!keys.length) return null;
      const sets = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
      const { rows } = await db.query(`update app.jobs set ${sets} where id = $1 returning ${JOB_COLUMNS}`, [id, ...keys.map((key) => patch[key])]);
      return rows[0] || null;
    },
    /** Marks a queued/running job as finished unless it already left that state (e.g. cancelled). */
    async finishInternal(id, patch) {
      const { rows } = await db.query(
        `update app.jobs set status = $2, stage = $3, error_code = $4, error_message = $5, gen_mode = coalesce($6, gen_mode),
           schema_source = coalesce($7, schema_source), finished_at = now()
         where id = $1 and status = any($8) returning ${JOB_COLUMNS}`,
        [id, patch.status, patch.stage || 'done', patch.errorCode || null, patch.errorMessage || null, patch.genMode || null, patch.schemaSource || null, ACTIVE],
      );
      return rows[0] || null;
    },
    /** Called at boot: jobs that were queued/running when the process died can't resume. */
    async failInterruptedInternal() {
      const { rows } = await db.query(
        `update app.jobs set status = 'failed', error_code = 'interrupted',
           error_message = 'The server restarted while this job was running. Run it again.', finished_at = now()
         where status = any($1) returning id`,
        [ACTIVE],
      );
      return rows.map((r) => r.id);
    },
  };

  const results = {
    async saveInternal(job, result) {
      await db.transaction(async (tx) => {
        await tx.query(
          `insert into app.job_results (job_id, owner_id, detections, detection_meta, schema, validation, templates, recognized_instructions)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (job_id) do update set detections = excluded.detections, detection_meta = excluded.detection_meta,
             schema = excluded.schema, validation = excluded.validation, templates = excluded.templates,
             recognized_instructions = excluded.recognized_instructions`,
          [job.id, job.owner_id, JSON.stringify(result.detections || []), JSON.stringify(result.detectionMeta || {}),
            JSON.stringify(result.schema ?? null), JSON.stringify(result.validation ?? null), JSON.stringify(result.templates || []),
            JSON.stringify(result.recognizedInstructions || [])],
        );
        for (const artifact of result.artifacts || []) {
          await tx.query(
            `insert into app.artifacts (job_id, owner_id, kind, content, sha256, byte_length, meta) values ($1, $2, $3, $4, $5, $6, $7)
             on conflict (job_id, kind) do update set content = excluded.content, sha256 = excluded.sha256,
               byte_length = excluded.byte_length, meta = excluded.meta, created_at = now()`,
            [job.id, job.owner_id, artifact.kind, artifact.content, artifact.sha256, artifact.byteLength, JSON.stringify(artifact.meta || {})],
          );
        }
      });
    },
    async get(ownerId, jobId) {
      if (!isUuid(jobId)) return null;
      const { rows } = await db.query(
        `select r.detections, r.detection_meta, r.schema, r.validation, r.templates, r.recognized_instructions
           from app.job_results r where r.job_id = $1 and r.owner_id = $2`,
        [jobId, ownerId],
      );
      if (!rows[0]) return null;
      const { rows: artifacts } = await db.query(
        'select id, kind, content, sha256, byte_length, meta, created_at from app.artifacts where job_id = $1 and owner_id = $2',
        [jobId, ownerId],
      );
      return { ...rows[0], artifacts: Object.fromEntries(artifacts.map((a) => [a.kind, a])) };
    },
  };

  return { projects, jobs, results };
}

module.exports = { createRepositories, isUuid, ACTIVE };
