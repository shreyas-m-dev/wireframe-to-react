'use strict';

/**
 * In-process job queue with a hard concurrency limit. Generation runs in the
 * background: the API returns 202 and the client polls the job row, whose
 * status/stage the runner keeps current in the database.
 *
 * Limits: at most `maxConcurrent` pipelines run at once and at most
 * `maxQueued` wait; beyond that enqueue() throws QueueFullError (HTTP 503).
 * Jobs survive in the DB but not the queue: on restart, queued/running jobs
 * are marked failed('interrupted') so nothing spins forever.
 */

const { PipelineError } = require('../pipeline/python');

class QueueFullError extends Error {}

class JobRunner {
  constructor({ repos, runPipeline, logger, maxConcurrent = 2, maxQueued = 20, stageTimeoutMs = 180_000, genMode = 'template' }) {
    Object.assign(this, { repos, runPipeline, logger, maxConcurrent, maxQueued, stageTimeoutMs, genMode });
    this.queue = [];
    this.active = new Map(); // jobId -> AbortController
    this.idleWaiters = [];
    this.stopping = false;
  }

  get size() { return this.queue.length + this.active.size; }

  enqueue(jobId) {
    if (this.stopping) throw new QueueFullError('Server is shutting down');
    if (this.queue.length >= this.maxQueued) throw new QueueFullError('Queue is full');
    this.queue.push(jobId);
    setImmediate(() => this.drain());
  }

  /** Cancels a queued or running job. Returns true if the runner knew about it. */
  cancel(jobId) {
    const queuedAt = this.queue.indexOf(jobId);
    if (queuedAt >= 0) { this.queue.splice(queuedAt, 1); return true; }
    const controller = this.active.get(jobId);
    if (controller) { controller.abort(); return true; }
    return false;
  }

  drain() {
    while (!this.stopping && this.active.size < this.maxConcurrent && this.queue.length) {
      const jobId = this.queue.shift();
      const controller = new AbortController();
      this.active.set(jobId, controller);
      this.execute(jobId, controller.signal)
        .catch((error) => this.logger.error('job.runner_crash', { jobId, message: error.message, stack: error.stack }))
        .finally(() => {
          this.active.delete(jobId);
          if (this.size === 0) this.idleWaiters.splice(0).forEach((resolve) => resolve());
          this.drain();
        });
    }
  }

  async execute(jobId, signal) {
    const job = await this.repos.jobs.getInternal(jobId);
    if (!job || job.status !== 'queued') return; // cancelled or deleted while waiting
    const started = Date.now();
    await this.repos.jobs.updateInternal(jobId, { status: 'running', stage: 'preprocess', started_at: new Date().toISOString() });
    this.logger.info('job.started', { jobId });
    try {
      const result = await this.runPipeline(job, {
        signal,
        stageTimeoutMs: this.stageTimeoutMs,
        genMode: this.genMode,
        onStage: async (stage) => {
          if (signal.aborted) return;
          await this.repos.jobs.updateInternal(jobId, { stage });
        },
      });
      if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      await this.repos.results.saveInternal(job, result);
      await this.repos.jobs.finishInternal(jobId, { status: result.status, errorCode: result.errorCode, errorMessage: result.errorMessage, genMode: result.genMode, schemaSource: result.schemaSource });
      this.logger.info('job.finished', { jobId, status: result.status, durationMs: Date.now() - started });
    } catch (error) {
      if (error.name === 'AbortError' || signal.aborted) {
        await this.repos.jobs.finishInternal(jobId, { status: 'cancelled', stage: 'done', errorCode: 'cancelled', errorMessage: 'The job was cancelled.' });
        this.logger.info('job.cancelled', { jobId });
        return;
      }
      const known = error instanceof PipelineError;
      await this.repos.jobs.finishInternal(jobId, {
        status: 'failed',
        stage: 'done',
        errorCode: known ? error.code : 'internal_error',
        errorMessage: known ? error.userMessage : 'Processing failed unexpectedly. Try again.',
      });
      this.logger[known ? 'info' : 'error']('job.failed', { jobId, code: known ? error.code : 'internal_error', detail: known ? error.detail?.slice(0, 500) : error.message, stack: known ? undefined : error.stack });
    }
  }

  /** Resolves once nothing is queued or running (tests, shutdown). */
  idle() {
    return this.size === 0 ? Promise.resolve() : new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  /** Stops intake, cancels queued work, aborts running jobs and waits for them to settle. */
  async shutdown(timeoutMs = 10_000) {
    this.stopping = true;
    const queued = this.queue.splice(0);
    for (const jobId of queued) {
      await this.repos.jobs.finishInternal(jobId, { status: 'failed', stage: 'done', errorCode: 'interrupted', errorMessage: 'The server restarted before this job ran. Run it again.' }).catch(() => {});
    }
    for (const controller of this.active.values()) controller.abort();
    await Promise.race([this.idle(), new Promise((resolve) => setTimeout(resolve, timeoutMs).unref())]);
  }
}

module.exports = { JobRunner, QueueFullError };
