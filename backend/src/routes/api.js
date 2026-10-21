'use strict';

/**
 * Authenticated API. Every handler runs after requireAuth, and every lookup
 * goes through a repository function scoped to req.user.userId, so a foreign
 * id returns 404 exactly like a missing one (no existence oracle).
 */

const express = require('express');
const { HttpError, notFound } = require('../http/errors');
const { limiter, requireAdmin } = require('../http/middleware');
const { uploadMiddleware, inspectUpload } = require('../uploads');
const { QueueFullError } = require('../jobs/runner');
const { createProjectZip } = require('../export');
const { callPython } = require('../pipeline/python');

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    projectId: job.project_id,
    parentJobId: job.parent_job_id,
    status: job.status,
    stage: job.stage,
    instructions: job.instructions,
    source: { filename: job.source_filename, mime: job.source_mime, bytes: job.source_bytes, available: Boolean(job.source_path) },
    genMode: job.gen_mode,
    schemaSource: job.schema_source,
    error: job.error_code ? { code: job.error_code, message: job.error_message } : null,
    createdAt: job.created_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
  };
}

const publicProject = (p) => p && { id: p.id, name: p.name, createdAt: p.created_at, updatedAt: p.updated_at };

function projectName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 120) throw new HttpError(422, 'invalid_name', 'Project name must be 1–120 characters.');
  return name;
}

function instructionsField(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new HttpError(422, 'invalid_instructions', 'Instructions must be text.');
  if (value.length > 1500) throw new HttpError(422, 'invalid_instructions', 'Instructions can be at most 1500 characters.');
  return value;
}

function idempotencyKey(req) {
  const key = req.get('Idempotency-Key');
  if (key === undefined) return null;
  if (!/^[A-Za-z0-9_\-:.]{8,128}$/.test(key)) throw new HttpError(422, 'invalid_idempotency_key', 'Idempotency-Key must be 8–128 URL-safe characters.');
  return key;
}

function createApiRouter({ config, repos, runner, blobs }) {
  const router = express.Router();
  const perUser = limiter({ windowMs: 60_000, limit: 240, keyByUser: true });
  const jobCreation = limiter({ windowMs: 60_000, limit: 10, keyByUser: true });
  router.use(perUser);

  /** Per-user quotas, counted in the database so restarts don't reset them. */
  async function assertQuota(userId) {
    if (await repos.jobs.countActive(userId) >= config.maxActiveJobsPerUser) {
      throw new HttpError(429, 'too_many_active_jobs', `You already have ${config.maxActiveJobsPerUser} jobs running. Wait for one to finish or cancel it.`, { retryAfterSec: 30 });
    }
    if (await repos.jobs.countSince(userId, new Date(Date.now() - 3_600_000).toISOString()) >= config.jobsPerHourPerUser) {
      throw new HttpError(429, 'hourly_quota_exceeded', 'You have reached the hourly generation limit. Try again later.', { retryAfterSec: 600 });
    }
  }

  async function startJob(req, res, { projectId, fields, sourceBuffer, sourceExt, copyFrom }) {
    const userId = req.user.userId;
    const key = idempotencyKey(req);
    // A retried request (same key) replays the original job without counting against quota.
    const replay = key ? await repos.jobs.findByIdempotencyKey(userId, key) : null;
    if (replay) return res.status(200).json({ job: publicJob(replay), replayed: true });
    await assertQuota(userId);
    const { job, created } = await repos.jobs.create(userId, { ...fields, projectId, idempotencyKey: key, genMode: config.genMode });
    if (!created) return res.status(200).json({ job: publicJob(job), replayed: true });
    let stored;
    try {
      const sourcePath = copyFrom ? blobs.copy(copyFrom, userId, job.id) : blobs.write(userId, job.id, sourceExt, sourceBuffer);
      stored = await repos.jobs.updateInternal(job.id, { source_path: sourcePath });
      runner.enqueue(job.id);
    } catch (error) {
      const busy = error instanceof QueueFullError;
      await repos.jobs.finishInternal(job.id, { status: 'failed', errorCode: busy ? 'server_busy' : 'storage_failed', errorMessage: busy ? 'The server is busy. Try again in a minute.' : 'The upload could not be stored.' });
      if (busy) throw new HttpError(503, 'server_busy', 'The server is busy. Try again in a minute.', { retryAfterSec: 60 });
      throw error;
    }
    res.status(202).location(`/api/jobs/${job.id}`).json({ job: publicJob(stored || job) });
  }

  // --- account -------------------------------------------------------------
  router.get('/me', (req, res) => {
    res.json({
      user: { id: req.user.userId, email: req.user.email },
      isAdmin: config.adminUserIds.has(req.user.userId),
      limits: { maxUploadBytes: config.maxUploadBytes, maxActiveJobs: config.maxActiveJobsPerUser, jobsPerHour: config.jobsPerHourPerUser },
      genMode: config.genMode,
    });
  });

  // --- projects --------------------------------------------------------------
  router.get('/projects', asyncRoute(async (req, res) => {
    const page = await repos.projects.list(req.user.userId, { limit: req.query.limit, cursor: req.query.cursor });
    res.json({ projects: page.items.map(publicProject), nextCursor: page.nextCursor });
  }));

  router.post('/projects', asyncRoute(async (req, res) => {
    const project = await repos.projects.create(req.user.userId, projectName(req.body?.name));
    res.status(201).location(`/api/projects/${project.id}`).json({ project: publicProject(project) });
  }));

  router.get('/projects/:projectId', asyncRoute(async (req, res) => {
    const project = await repos.projects.get(req.user.userId, req.params.projectId);
    if (!project) throw notFound('Project');
    res.json({ project: publicProject(project) });
  }));

  router.patch('/projects/:projectId', asyncRoute(async (req, res) => {
    const project = await repos.projects.rename(req.user.userId, req.params.projectId, projectName(req.body?.name));
    if (!project) throw notFound('Project');
    res.json({ project: publicProject(project) });
  }));

  router.delete('/projects/:projectId', asyncRoute(async (req, res) => {
    const removed = await repos.projects.remove(req.user.userId, req.params.projectId);
    if (!removed) throw notFound('Project');
    removed.jobIds.forEach((id) => runner.cancel(id));
    removed.sourcePaths.forEach((p) => blobs.remove(p));
    res.status(204).end();
  }));

  router.get('/projects/:projectId/jobs', asyncRoute(async (req, res) => {
    const project = await repos.projects.get(req.user.userId, req.params.projectId);
    if (!project) throw notFound('Project');
    const page = await repos.jobs.listByProject(req.user.userId, project.id, { limit: req.query.limit, cursor: req.query.cursor });
    res.json({ jobs: page.items.map(publicJob), nextCursor: page.nextCursor });
  }));

  router.post('/projects/:projectId/jobs', jobCreation, uploadMiddleware(config.maxUploadBytes), asyncRoute(async (req, res) => {
    const project = await repos.projects.get(req.user.userId, req.params.projectId);
    if (!project) throw notFound('Project');
    const upload = inspectUpload(req.file);
    await startJob(req, res, {
      projectId: project.id,
      fields: { instructions: instructionsField(req.body?.instructions), sourceFilename: upload.filename, sourceMime: upload.mime, sourceBytes: upload.buffer.length, sourceSha256: upload.sha256 },
      sourceBuffer: upload.buffer,
      sourceExt: upload.ext,
    });
  }));

  // --- jobs ------------------------------------------------------------------
  const ownedJob = async (req) => {
    const job = await repos.jobs.get(req.user.userId, req.params.jobId);
    if (!job) throw notFound('Job');
    return job;
  };

  router.get('/jobs/:jobId', asyncRoute(async (req, res) => {
    res.json({ job: publicJob(await ownedJob(req)) });
  }));

  router.get('/jobs/:jobId/result', asyncRoute(async (req, res) => {
    const job = await ownedJob(req);
    const result = await repos.results.get(req.user.userId, job.id);
    if (!result) throw new HttpError(409, 'result_not_ready', 'This job has no result yet.');
    const jsx = result.artifacts.jsx;
    const preview = result.artifacts['preview-js'];
    res.json({
      job: publicJob(job),
      detections: result.detections,
      detectionMeta: { canvas: result.detection_meta?.canvas || null, category: result.detection_meta?.category || null, vision: result.detection_meta?.vision || null },
      schema: result.schema,
      validation: result.validation,
      templates: result.templates,
      recognizedInstructions: result.recognized_instructions,
      code: jsx?.content || null,
      artifact: jsx ? { id: jsx.id, sha256: jsx.sha256, byteLength: jsx.byte_length, createdAt: jsx.created_at } : null,
      preview: preview ? { js: preview.content, componentName: preview.meta?.componentName, sha256: preview.sha256 } : null,
    });
  }));

  router.get('/jobs/:jobId/source', asyncRoute(async (req, res) => {
    const job = await ownedJob(req);
    if (!job.source_path || !blobs.exists(job.source_path)) throw new HttpError(410, 'source_unavailable', 'The original image is no longer stored.');
    res.set({ 'Content-Type': job.source_mime, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline' });
    res.send(blobs.read(job.source_path));
  }));

  router.get('/jobs/:jobId/export', asyncRoute(async (req, res) => {
    const job = await ownedJob(req);
    const result = await repos.results.get(req.user.userId, job.id);
    const code = result?.artifacts.jsx?.content;
    if (!code) throw new HttpError(409, 'result_not_ready', 'This job has no generated code to export.');
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="generated-${job.id.slice(0, 8)}.zip"`, 'Cache-Control': 'private, no-store' });
    res.send(createProjectZip(code));
  }));

  router.post('/jobs/:jobId/cancel', asyncRoute(async (req, res) => {
    const job = await ownedJob(req);
    if (!['queued', 'running'].includes(job.status)) throw new HttpError(409, 'not_cancellable', 'Only queued or running jobs can be cancelled.');
    const wasRunning = runner.cancel(job.id);
    if (!wasRunning || job.status === 'queued') await repos.jobs.finishInternal(job.id, { status: 'cancelled', errorCode: 'cancelled', errorMessage: 'The job was cancelled.' });
    res.status(202).json({ job: publicJob(await repos.jobs.get(req.user.userId, job.id)) });
  }));

  router.post('/jobs/:jobId/regenerate', jobCreation, asyncRoute(async (req, res) => {
    const parent = await ownedJob(req);
    if (!parent.source_path || !blobs.exists(parent.source_path)) throw new HttpError(410, 'source_unavailable', 'The original image is no longer stored. Upload it again.');
    await startJob(req, res, {
      projectId: parent.project_id,
      fields: {
        parentJobId: parent.id,
        instructions: req.body && 'instructions' in req.body ? instructionsField(req.body.instructions) : parent.instructions,
        sourceFilename: parent.source_filename, sourceMime: parent.source_mime, sourceBytes: parent.source_bytes, sourceSha256: parent.source_sha256,
      },
      copyFrom: parent.source_path,
    });
  }));

  router.delete('/jobs/:jobId', asyncRoute(async (req, res) => {
    const job = await ownedJob(req);
    runner.cancel(job.id);
    const removed = await repos.jobs.remove(req.user.userId, job.id);
    if (removed) blobs.remove(removed.source_path);
    res.status(204).end();
  }));

  // --- vision provider diagnostics (admin only: these can incur provider cost) ---
  const admin = [requireAdmin(config.adminUserIds), limiter({ windowMs: 3_600_000, limit: 20, keyByUser: true })];
  router.get('/vision/status', admin, (req, res) => {
    const enabled = String(process.env.VISION_ENABLED || 'false').toLowerCase() === 'true';
    res.json({ visionEnabled: enabled, provider: (process.env.VISION_PROVIDER || 'disabled').toLowerCase(), model: process.env.VISION_MODEL || null, apiKeyConfigured: Boolean(process.env.VISION_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) });
  });
  router.post('/vision/smoke-test', admin, asyncRoute(async (req, res) => {
    res.json(await callPython(['vision-smoke'], { timeoutMs: 60_000 }));
  }));
  router.get('/vision/gemini/models', admin, asyncRoute(async (req, res) => {
    res.json(await callPython(['vision-gemini-models'], { timeoutMs: 30_000 }));
  }));

  router.use((req, _res, next) => next(new HttpError(404, 'not_found', 'Unknown API route.')));
  return router;
}

module.exports = { createApiRouter, publicJob };
