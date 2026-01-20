import { v4 as uuidv4 } from 'uuid';
import notificationDispatcher from './notificationDispatcher.js';
import notificationMetrics from './metrics/notificationMetrics.js';
import { logger } from '../middlewares/errorHandler.js';

const workerId = process.env.NOTIFICATION_WORKER_ID || uuidv4();
const workerColor = process.env.NOTIFICATION_WORKER_COLOR || 'blue';
const defaultDrainTimeoutMs = Number.parseInt(process.env.NOTIFICATION_WORKER_DRAIN_TIMEOUT_MS ?? '45000', 10) || 45000;

let draining = false;
let currentDrainPromise = null;
let lastDrainStartedAt = null;
let lastDrainCompletedAt = null;
let lastDrainResult = null;
let lastDrainError = null;

function getMetricsSnapshot() {
  const snapshot = notificationMetrics.snapshot();
  return {
    queueDepth: snapshot.queueDepth,
    activeJobs: snapshot.activeJobs,
    counters: snapshot.counters,
    timings: snapshot.timings
  };
}

export function getWorkerState() {
  return {
    workerId,
    color: workerColor,
    draining,
    lastDrainStartedAt,
    lastDrainCompletedAt,
    lastDrainResult,
    lastDrainError,
    metrics: getMetricsSnapshot(),
    processUptimeSeconds: process.uptime()
  };
}

export function isDraining() {
  return draining;
}

export function initializeWorkerState() {
  logger.info('[notification-worker] registration complete', {
    workerId,
    color: workerColor,
    defaultDrainTimeoutMs
  });
}

export function drainWorker({ timeoutMs = defaultDrainTimeoutMs } = {}) {
  if (currentDrainPromise) {
    return currentDrainPromise;
  }

  draining = true;
  lastDrainStartedAt = new Date().toISOString();
  lastDrainError = null;
  lastDrainResult = null;

  logger.info('[notification-worker] drain started', {
    workerId,
    color: workerColor,
    timeoutMs
  });

  const runDrain = async () => {
    try {
      await notificationDispatcher.awaitIdle({ timeoutMs });
      lastDrainCompletedAt = new Date().toISOString();
      lastDrainResult = 'success';
      logger.info('[notification-worker] drain completed', {
        workerId,
        color: workerColor,
        queueDepth: getMetricsSnapshot().queueDepth
      });
      return getWorkerState();
    } catch (error) {
      lastDrainCompletedAt = new Date().toISOString();
      lastDrainResult = 'timeout';
      lastDrainError = error?.message ?? 'unknown error';
      logger.error('[notification-worker] drain failed', {
        workerId,
        color: workerColor,
        error: lastDrainError
      });
      throw error;
    } finally {
      draining = false;
      currentDrainPromise = null;
    }
  };

  currentDrainPromise = runDrain();
  return currentDrainPromise;
}

export function __resetWorkerStateForTests() {
  draining = false;
  currentDrainPromise = null;
  lastDrainStartedAt = null;
  lastDrainCompletedAt = null;
  lastDrainResult = null;
  lastDrainError = null;
}

export default {
  getWorkerState,
  isDraining,
  initializeWorkerState,
  drainWorker
};
