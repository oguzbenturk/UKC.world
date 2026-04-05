import client from 'prom-client';

const serviceName = process.env.PROMETHEUS_SERVICE_NAME || 'plannivo-backend';
const registry = new client.Registry();
registry.setDefaultLabels({ service: serviceName });

const collectIntervalMs = Number.parseInt(process.env.PROMETHEUS_COLLECT_INTERVAL_MS ?? '10000', 10) || 10000;
client.collectDefaultMetrics({ register: registry, prefix: 'plannivo_', timeout: collectIntervalMs });

const queueDepthGauge = new client.Gauge({
  name: 'notification_queue_depth',
  help: 'Current number of notification jobs waiting to be processed.',
  registers: [registry]
});

const activeJobsGauge = new client.Gauge({
  name: 'notification_active_jobs',
  help: 'Current number of notification jobs actively processing.',
  registers: [registry]
});

const jobWaitHistogram = new client.Histogram({
  name: 'notification_job_wait_duration_ms',
  help: 'Time notification jobs spend waiting in the dispatcher queue before execution.',
  labelNames: ['job_type'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000],
  registers: [registry]
});

const jobDurationHistogram = new client.Histogram({
  name: 'notification_job_duration_ms',
  help: 'Processing duration of notification jobs, excluding queue wait time.',
  labelNames: ['job_type'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000],
  registers: [registry]
});

const jobResultCounter = new client.Counter({
  name: 'notification_jobs_total',
  help: 'Total notification jobs by result outcome.',
  labelNames: ['result', 'job_type'],
  registers: [registry]
});

const jobFailureCounter = new client.Counter({
  name: 'notification_job_failures_total',
  help: 'Total notification jobs that failed permanently grouped by reason.',
  labelNames: ['reason', 'job_type'],
  registers: [registry]
});

const dropReasonCounter = new client.Counter({
  name: 'notification_jobs_dropped_total',
  help: 'Notification jobs dropped before execution grouped by reason.',
  labelNames: ['reason'],
  registers: [registry]
});

export const prometheusRegistry = registry;

export function setQueueDepth(depth) {
  if (typeof depth === 'number' && !Number.isNaN(depth)) {
    queueDepthGauge.set(depth);
  }
}

export function setActiveJobs(count) {
  if (typeof count === 'number' && !Number.isNaN(count)) {
    activeJobsGauge.set(count);
  }
}

export function observeJobWait({ jobType = 'unknown', waitMs = 0 } = {}) {
  if (typeof waitMs === 'number' && waitMs >= 0) {
    jobWaitHistogram.labels(jobType || 'unknown').observe(waitMs);
  }
}

export function observeJobDuration({ jobType = 'unknown', durationMs = 0 } = {}) {
  if (typeof durationMs === 'number' && durationMs >= 0) {
    jobDurationHistogram.labels(jobType || 'unknown').observe(durationMs);
  }
}

export function incrementJobResult({ result = 'unknown', jobType = 'unknown', count = 1 } = {}) {
  if (!Number.isFinite(count) || count <= 0) {
    return;
  }
  jobResultCounter.labels(result || 'unknown', jobType || 'unknown').inc(count);
}

export function incrementFailure({ reason = 'unknown', jobType = 'unknown', count = 1 } = {}) {
  if (!Number.isFinite(count) || count <= 0) {
    return;
  }
  jobFailureCounter.labels(reason || 'unknown', jobType || 'unknown').inc(count);
}

export function incrementDropped({ reason = 'unknown', count = 1 } = {}) {
  if (!Number.isFinite(count) || count <= 0) {
    return;
  }
  dropReasonCounter.labels(reason || 'unknown').inc(count);
}

export async function getPrometheusMetrics() {
  return registry.metrics();
}

export function resetPrometheusMetrics() {
  registry.resetMetrics();
}

export default {
  registry,
  setQueueDepth,
  setActiveJobs,
  observeJobWait,
  observeJobDuration,
  incrementJobResult,
  incrementFailure,
  incrementDropped,
  getPrometheusMetrics,
  resetPrometheusMetrics
};
