import { logger } from '../middlewares/errorHandler.js';
import notificationMetrics from './metrics/notificationMetrics.js';

const DEFAULT_CONCURRENCY = Number.parseInt(process.env.NOTIFICATION_QUEUE_CONCURRENCY ?? '8', 10) || 8;
const DEFAULT_PER_TENANT = Number.parseInt(process.env.NOTIFICATION_PER_TENANT_CONCURRENCY ?? '4', 10) || 4;
const MAX_QUEUE_LENGTH = Number.parseInt(process.env.NOTIFICATION_MAX_QUEUE_LENGTH ?? '20000', 10) || 20000;

const resolveJobType = (job) => job?.meta?.type || job?.type || 'unknown';

export class NotificationDispatcher {
  constructor() {
    this.globalQueue = [];
    this.tenantQueues = new Map();
    this.tenantOrder = [];
    this.tenantPointer = 0;

    this.active = 0;
    this.concurrency = DEFAULT_CONCURRENCY;
    this.perTenantLimit = DEFAULT_PER_TENANT;
    this.activePerTenant = new Map();
    this.idempotencyCache = new Set();
    this.processing = false;
    this.hasDrainedResolvers = new Set();
  }

  configure({ concurrency, perTenantLimit } = {}) {
    if (Number.isFinite(concurrency) && concurrency > 0) {
      this.concurrency = concurrency;
    }
    if (Number.isFinite(perTenantLimit) && perTenantLimit > 0) {
      this.perTenantLimit = perTenantLimit;
    }
  }

  enqueue(job) {
    if (!job || typeof job.execute !== 'function') {
      notificationMetrics.recordDropped('invalid-job', { jobType: resolveJobType(job) });
      return;
    }

    if (job.idempotencyKey && this.idempotencyCache.has(job.idempotencyKey)) {
      notificationMetrics.recordDeduplicated({ jobType: resolveJobType(job) });
      return;
    }

    if (this._queuedCount() >= MAX_QUEUE_LENGTH) {
      const droppedJob = this._evictOldestJob();
      notificationMetrics.recordDropped('capacity', { jobType: resolveJobType(droppedJob) });
      logger.warn('Notification dispatcher queue over capacity, dropping oldest job', {
        droppedJob: droppedJob?.meta ?? null,
        queueLength: this._queuedCount()
      });
    }

    if (job.idempotencyKey) {
      this.idempotencyCache.add(job.idempotencyKey);
    }

    const priority = Number.isFinite(job.priority) ? job.priority : 0;
    const wrappedJob = {
      ...job,
      attempts: job.attempts ?? 0,
      enqueuedAt: Date.now(),
      priority
    };

    if (wrappedJob.tenantKey) {
      this._enqueueTenantJob(wrappedJob);
    } else {
      this._insertJobByPriority(this.globalQueue, wrappedJob);
    }

    notificationMetrics.recordQueued({ jobType: resolveJobType(wrappedJob), queueDepth: this._queuedCount() });
    this._scheduleProcessing();
  }

  enqueueMany(jobs = []) {
    jobs.forEach((job) => this.enqueue(job));
  }

  releaseIdempotencyKey(key) {
    if (!key) {
      return;
    }
    this.idempotencyCache.delete(key);
  }

  async awaitIdle({ timeoutMs = 5000 } = {}) {
    if (this._queuedCount() === 0 && this.active === 0) {
      return;
    }

    let timeoutId;
    const waiterPromise = new Promise((resolve, reject) => {
      const resolver = () => {
        clearTimeout(timeoutId);
        this.hasDrainedResolvers.delete(resolver);
        resolve();
      };
      this.hasDrainedResolvers.add(resolver);

      timeoutId = setTimeout(() => {
        this.hasDrainedResolvers.delete(resolver);
        reject(new Error('Notification dispatcher idle wait timed out'));
      }, timeoutMs);
    });

    this._scheduleProcessing();
    return waiterPromise;
  }

  clearCaches() {
    this.idempotencyCache.clear();
    notificationMetrics.reset();
    this.globalQueue = [];
    this.tenantQueues.clear();
    this.tenantOrder = [];
    this.tenantPointer = 0;
  }

  _scheduleProcessing() {
    if (this.processing) {
      return;
    }
    this.processing = true;
    setImmediate(() => this._processQueue());
  }

  async _processQueue() {
    try {
      while (this.active < this.concurrency) {
        const job = this._dequeueNextJob();
        if (!job) {
          break;
        }

        this._startJob(job);
      }
    } finally {
      this.processing = false;
      if (this._queuedCount() > 0 && this.active < this.concurrency) {
        this._scheduleProcessing();
      } else if (this._queuedCount() === 0 && this.active === 0) {
        this._notifyDrained();
      }
    }
  }

  _notifyDrained() {
    if (this.hasDrainedResolvers.size === 0) {
      notificationMetrics.logSnapshot('dispatcher-drained');
      return;
    }

    for (const resolve of Array.from(this.hasDrainedResolvers)) {
      resolve();
    }
    this.hasDrainedResolvers.clear();
    notificationMetrics.logSnapshot('dispatcher-drained');
  }

  _canProcess(job) {
    const tenantKey = job.tenantKey;
    if (!tenantKey) {
      return true;
    }
    const current = this.activePerTenant.get(tenantKey) ?? 0;
    if (current >= this.perTenantLimit) {
      return false;
    }
    return true;
  }

  _startJob(job) {
    const tenantKey = job.tenantKey;
    if (tenantKey) {
      const current = this.activePerTenant.get(tenantKey) ?? 0;
      this.activePerTenant.set(tenantKey, current + 1);
    }

    this.active += 1;
    notificationMetrics.updateActiveJobs(this.active);
    const startedAt = Date.now();
    const waitMs = Math.max(0, startedAt - (job.enqueuedAt ?? startedAt));
    const jobType = resolveJobType(job);

    job
      .execute()
      .then(() => {
        const duration = Date.now() - startedAt;
        notificationMetrics.recordProcessed({
          jobType,
          durationMs: duration,
          waitMs
        });
      })
      .catch((error) => {
        const duration = Date.now() - startedAt;
        notificationMetrics.recordFailed(1, error, { jobType, durationMs: duration, waitMs });
        if (job.handleFailure) {
          job.handleFailure(error, job);
        } else {
          logger.error('Notification dispatcher job failed', {
            error: error?.message,
            stack: error?.stack,
            meta: job.meta || null
          });
        }
      })
      .finally(() => {
        this.active -= 1;
        notificationMetrics.updateActiveJobs(this.active);
        if (tenantKey) {
          const current = this.activePerTenant.get(tenantKey) ?? 1;
          if (current <= 1) {
            this.activePerTenant.delete(tenantKey);
          } else {
            this.activePerTenant.set(tenantKey, current - 1);
          }
        }

        if (job.idempotencyKey && job.idempotencyTtlMs) {
          setTimeout(() => this.idempotencyCache.delete(job.idempotencyKey), job.idempotencyTtlMs);
        } else if (job.idempotencyKey && !job.persistIdempotency) {
          // Keep cached for 10 minutes by default to prevent rapid duplicates.
          setTimeout(() => this.idempotencyCache.delete(job.idempotencyKey), 10 * 60 * 1000);
        }

        const duration = Date.now() - startedAt;
        if (duration > 2000) {
          logger.warn('Notification job execution exceeded threshold', {
            duration,
            meta: job.meta || null
          });
        }

        notificationMetrics.updateQueueDepth(this._queuedCount());

        if (this._queuedCount() > 0) {
          this._scheduleProcessing();
        } else if (this.active === 0) {
          this._notifyDrained();
        }
      });
  }

  _insertJobByPriority(queue, job) {
    if (!queue.length) {
      queue.push(job);
      return;
    }

    const index = queue.findIndex((existing) => existing.priority < job.priority);
    if (index === -1) {
      queue.push(job);
    } else {
      queue.splice(index, 0, job);
    }
  }

  _enqueueTenantJob(job) {
    const tenantKey = job.tenantKey;
    let queue = this.tenantQueues.get(tenantKey);
    if (!queue) {
      queue = [];
      this.tenantQueues.set(tenantKey, queue);
      this.tenantOrder.push(tenantKey);
    }

    this._insertJobByPriority(queue, job);
  }

  _queuedCount() {
    let count = this.globalQueue.length;
    for (const queue of this.tenantQueues.values()) {
      count += queue.length;
    }
    return count;
  }

  _removeTenantQueue(tenantKey) {
    this.tenantQueues.delete(tenantKey);
    const index = this.tenantOrder.indexOf(tenantKey);
    if (index === -1) {
      return;
    }
    this.tenantOrder.splice(index, 1);
    if (this.tenantOrder.length === 0) {
      this.tenantPointer = 0;
    } else if (this.tenantPointer >= this.tenantOrder.length) {
      this.tenantPointer = 0;
    }
  }

  _dequeueNextJob() {
    if (this.tenantOrder.length > 0) {
      const visited = new Set();

      while (this.tenantOrder.length > 0 && visited.size < this.tenantOrder.length) {
        if (this.tenantPointer >= this.tenantOrder.length) {
          this.tenantPointer = 0;
        }

        const tenantKey = this.tenantOrder[this.tenantPointer];
        const queue = this.tenantQueues.get(tenantKey);

        if (!queue || queue.length === 0) {
          this._removeTenantQueue(tenantKey);
          continue;
        }

        if (!this._canProcess(queue[0])) {
          visited.add(tenantKey);
          this.tenantPointer = (this.tenantPointer + 1) % this.tenantOrder.length;
          continue;
        }

        const job = queue.shift();
        if (queue.length === 0) {
          this._removeTenantQueue(tenantKey);
        } else {
          this.tenantPointer = (this.tenantPointer + 1) % this.tenantOrder.length;
        }

        return job;
      }
    }

    for (let i = 0; i < this.globalQueue.length; i += 1) {
      const job = this.globalQueue[i];
      if (!this._canProcess(job)) {
        continue;
      }
      this.globalQueue.splice(i, 1);
      return job;
    }

    return null;
  }

  _evictOldestJob() {
    let oldest = null;

    const consider = (job, type, key, index) => {
      if (!job) {
        return;
      }
      if (!oldest || job.enqueuedAt < oldest.job.enqueuedAt) {
        oldest = { job, type, key, index };
      }
    };

    this.globalQueue.forEach((job, index) => consider(job, 'global', null, index));
    for (const [tenantKey, queue] of this.tenantQueues.entries()) {
      queue.forEach((job, index) => consider(job, 'tenant', tenantKey, index));
    }

    if (!oldest) {
      return null;
    }

    if (oldest.type === 'global') {
      this.globalQueue.splice(oldest.index, 1);
    } else if (oldest.type === 'tenant') {
      const queue = this.tenantQueues.get(oldest.key);
      if (queue) {
        queue.splice(oldest.index, 1);
        if (queue.length === 0) {
          this._removeTenantQueue(oldest.key);
        }
      }
    }

    if (oldest.job?.idempotencyKey) {
      this.idempotencyCache.delete(oldest.job.idempotencyKey);
    }

    notificationMetrics.updateQueueDepth(this._queuedCount());

    return oldest.job;
  }
}

export const notificationDispatcher = new NotificationDispatcher();

export default notificationDispatcher;
