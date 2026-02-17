import { EventEmitter } from 'events';
import { logger } from '../../middlewares/errorHandler.js';
import {
  setQueueDepth,
  setActiveJobs,
  observeJobDuration,
  observeJobWait,
  incrementJobResult,
  incrementFailure,
  incrementDropped
} from './prometheusMetrics.js';

class NotificationMetrics extends EventEmitter {
  constructor() {
    super();
    this.counters = {
      queued: 0,
      processed: 0,
      failed: 0,
      retried: 0,
      retryScheduled: 0,
      deduplicated: 0,
      dropped: 0
    };
    this.timings = {
      lastProcessedAt: null,
      queueStartedAt: Date.now()
    };
    this.dropReasons = {};
    this.queueDepth = 0;
    this.activeJobs = 0;
  }

  recordQueued({ count = 1, jobType = 'unknown', queueDepth } = {}) {
    this.counters.queued += count;
    incrementJobResult({ result: 'queued', jobType, count });
    if (Number.isFinite(queueDepth)) {
      this.updateQueueDepth(queueDepth);
    }
    this.emit('queued', {
      snapshot: this.snapshot(),
      jobType,
      queueDepth: Number.isFinite(queueDepth) ? queueDepth : this.queueDepth
    });
  }

  recordProcessed({ count = 1, jobType = 'unknown', durationMs, waitMs } = {}) {
    this.counters.processed += count;
    this.timings.lastProcessedAt = Date.now();
    incrementJobResult({ result: 'processed', jobType, count });
    if (Number.isFinite(durationMs)) {
      observeJobDuration({ jobType, durationMs });
    }
    if (Number.isFinite(waitMs)) {
      observeJobWait({ jobType, waitMs });
    }
    this.emit('processed', {
      snapshot: this.snapshot(),
      jobType,
      durationMs,
      waitMs
    });
  }

  recordFailed(count = 1, error, { jobType = 'unknown', durationMs, waitMs } = {}) {
    this.counters.failed += count;
    incrementJobResult({ result: 'failed', jobType, count });
    const reason = error?.code || error?.name || error?.message || 'unknown';
    incrementFailure({ reason, jobType, count });
    if (Number.isFinite(durationMs)) {
      observeJobDuration({ jobType, durationMs });
    }
    if (Number.isFinite(waitMs)) {
      observeJobWait({ jobType, waitMs });
    }
    this.emit('failed', { snapshot: this.snapshot(), error, jobType, reason, durationMs, waitMs });
  }

  recordRetry({ jobType = 'unknown' } = {}) {
    this.counters.retried += 1;
    this.emit('retried', { snapshot: this.snapshot(), jobType });
  }

  recordRetryScheduled({ attempt, delayMs, jobType = 'unknown' }) {
    this.counters.retryScheduled += 1;
    this.emit('retryScheduled', {
      snapshot: this.snapshot(),
      attempt,
      delayMs,
      jobType
    });
  }

  recordDeduplicated({ jobType = 'unknown' } = {}) {
    this.counters.deduplicated += 1;
    incrementJobResult({ result: 'deduplicated', jobType, count: 1 });
    this.emit('deduplicated', { snapshot: this.snapshot(), jobType });
  }

  recordDropped(reason = 'unknown', { jobType = 'unknown' } = {}) {
    this.counters.dropped += 1;
    this.dropReasons[reason] = (this.dropReasons[reason] ?? 0) + 1;
    incrementJobResult({ result: 'dropped', jobType, count: 1 });
    incrementDropped({ reason, count: 1 });
    this.emit('dropped', { snapshot: this.snapshot(), reason, jobType });
  }

  updateQueueDepth(depth) {
    if (!Number.isFinite(depth)) {
      return;
    }
    this.queueDepth = depth;
    setQueueDepth(depth);
    this.emit('queueDepth', { snapshot: this.snapshot(), depth });
  }

  updateActiveJobs(count) {
    if (!Number.isFinite(count)) {
      return;
    }
    this.activeJobs = count;
    setActiveJobs(count);
    this.emit('activeJobs', { snapshot: this.snapshot(), count });
  }

  snapshot() {
    return {
      counters: { ...this.counters },
      timings: { ...this.timings },
      dropReasons: { ...this.dropReasons },
      queueDepth: this.queueDepth,
      activeJobs: this.activeJobs
    };
  }

  logSnapshot(context = 'notification-metrics') {
    const snapshot = this.snapshot();
    logger.info('Notification metrics snapshot', {
      context,
      counters: snapshot.counters,
      timings: snapshot.timings,
      dropReasons: snapshot.dropReasons
    });
  }

  reset() {
    this.counters = {
      queued: 0,
      processed: 0,
      failed: 0,
      retried: 0,
      retryScheduled: 0,
      deduplicated: 0,
      dropped: 0
    };
    this.timings.queueStartedAt = Date.now();
    this.timings.lastProcessedAt = null;
    this.dropReasons = {};
    this.queueDepth = 0;
    this.activeJobs = 0;
    setQueueDepth(0);
    setActiveJobs(0);
  }
}

export const notificationMetrics = new NotificationMetrics();

export default notificationMetrics;
