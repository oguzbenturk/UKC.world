import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import notificationDispatcher from '../services/notificationDispatcher.js';
import notificationMetrics from '../services/metrics/notificationMetrics.js';
import { logger } from '../middlewares/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);

const DEFAULTS = {
  jobs: 12000,
  concurrency: 48,
  perTenant: 4,
  tenantCount: 320,
  minWorkMs: 2,
  maxWorkMs: 6,
  timeoutMs: 120000,
  logEvery: 2000,
  priorityVariance: 3
};

const sleep = (ms) =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

const randomInt = (min, max) => {
  if (max <= min) {
    return Math.max(0, Math.round(min));
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const percentile = (values, p) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const config = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      continue;
    }
    const [rawKey, rawValue] = arg.split('=');
    const key = rawKey.replace(/^--/, '');
    if (rawValue !== undefined) {
      config[key] = rawValue;
      continue;
    }
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      config[key] = next;
      i += 1;
    } else {
      config[key] = true;
    }
  }

  return config;
};

const toNumberOption = (config, key, fallback) => {
  const raw = config[key];
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return fallback;
};

const toBooleanOption = (config, key, fallback = false) => {
  if (!(key in config)) {
    return fallback;
  }
  const raw = config[key];
  if (raw === true) {
    return true;
  }
  if (raw === false) {
    return false;
  }
  if (typeof raw === 'string') {
    const lowered = raw.toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(lowered)) {
      return true;
    }
    if (['0', 'false', 'no', 'n'].includes(lowered)) {
      return false;
    }
  }
  return fallback;
};

async function main() {
  const rawConfig = parseArgs();

  const jobs = toNumberOption(rawConfig, 'jobs', DEFAULTS.jobs);
  const concurrency = toNumberOption(rawConfig, 'concurrency', DEFAULTS.concurrency);
  const perTenant = toNumberOption(rawConfig, 'perTenant', DEFAULTS.perTenant);
  const tenantCount = toNumberOption(rawConfig, 'tenantCount', DEFAULTS.tenantCount);
  const minWorkMs = toNumberOption(rawConfig, 'minWorkMs', DEFAULTS.minWorkMs);
  const maxWorkMs = toNumberOption(rawConfig, 'maxWorkMs', DEFAULTS.maxWorkMs);
  const timeoutMs = toNumberOption(rawConfig, 'timeoutMs', DEFAULTS.timeoutMs);
  const logEvery = Math.max(1, toNumberOption(rawConfig, 'logEvery', DEFAULTS.logEvery));
  const priorityVariance = Math.max(0, toNumberOption(rawConfig, 'priorityVariance', DEFAULTS.priorityVariance));
  const silent = toBooleanOption(rawConfig, 'silent', false);

  const jobType = rawConfig.jobType || 'notification-load-test';

  const startTimestamp = new Date().toISOString();

  notificationMetrics.reset();
  notificationDispatcher.clearCaches();
  notificationDispatcher.configure({ concurrency, perTenantLimit: perTenant });

  let maxQueueDepth = 0;
  let maxActiveJobs = 0;

  notificationMetrics.on('queueDepth', ({ depth }) => {
    if (Number.isFinite(depth)) {
      maxQueueDepth = Math.max(maxQueueDepth, depth);
    }
  });
  notificationMetrics.on('activeJobs', ({ count }) => {
    if (Number.isFinite(count)) {
      maxActiveJobs = Math.max(maxActiveJobs, count);
    }
  });

  const waitTimes = [];
  const runTimes = [];

  const enqueueStart = performance.now();

  const logConfig = {
    jobs,
    concurrency,
    perTenant,
    tenantCount,
    minWorkMs,
    maxWorkMs,
    timeoutMs,
    priorityVariance,
    jobType
  };

  if (!silent) {
    logger.info('[notification-load-test] starting run', logConfig);
  }

  for (let index = 0; index < jobs; index += 1) {
    const tenantKey = tenantCount > 0 ? `tenant:${index % tenantCount}` : undefined;
    const priority = priorityVariance > 0 ? randomInt(0, priorityVariance) : 0;
    const enqueueTime = performance.now();

    notificationDispatcher.enqueue({
      tenantKey,
      priority,
      meta: { type: jobType, tenantKey, index },
      execute: async () => {
        const started = performance.now();
        waitTimes.push(started - enqueueTime);
        const workMs = randomInt(minWorkMs, maxWorkMs);
        if (workMs > 0) {
          await sleep(workMs);
        }
        const finished = performance.now();
        runTimes.push(finished - started);
      }
    });

    if (!silent && (index + 1) % logEvery === 0) {
      logger.info('[notification-load-test] enqueued batch', {
        queued: index + 1,
        percentComplete: Number(((index + 1) / jobs) * 100).toFixed(1)
      });
    }
  }

  const enqueueEnd = performance.now();

  if (!silent) {
    logger.info('[notification-load-test] queue fill completed', {
      elapsedMs: Number(enqueueEnd - enqueueStart).toFixed(2)
    });
  }

  let drainError = null;
  try {
    await notificationDispatcher.awaitIdle({ timeoutMs });
  } catch (error) {
    drainError = error;
    logger.error('[notification-load-test] dispatcher idle wait failed', {
      error: error?.message,
      timeoutMs
    });
  }

  const endTimestamp = new Date().toISOString();
  const endPerf = performance.now();
  const totalDurationMs = endPerf - enqueueStart;

  const snapshot = notificationMetrics.snapshot();
  const totalProcessed = snapshot.counters.processed;
  const totalFailed = snapshot.counters.failed;

  const waitP50 = percentile(waitTimes, 50);
  const waitP95 = percentile(waitTimes, 95);
  const waitP99 = percentile(waitTimes, 99);
  const runP50 = percentile(runTimes, 50);
  const runP95 = percentile(runTimes, 95);
  const runP99 = percentile(runTimes, 99);

  const throughput = totalProcessed > 0 ? totalProcessed / (totalDurationMs / 1000) : 0;

  const report = {
    config: logConfig,
    summary: {
      startTimestamp,
      endTimestamp,
      jobsEnqueued: jobs,
      totalProcessed,
      totalFailed,
      durationMs: Number(totalDurationMs.toFixed(2)),
      throughputPerSecond: Number(throughput.toFixed(2)),
      queueDepthPeak: maxQueueDepth,
      activeJobsPeak: maxActiveJobs,
      waitMs: {
        p50: Number(waitP50.toFixed(3)),
        p95: Number(waitP95.toFixed(3)),
        p99: Number(waitP99.toFixed(3))
      },
      runtimeMs: {
        p50: Number(runP50.toFixed(3)),
        p95: Number(runP95.toFixed(3)),
        p99: Number(runP99.toFixed(3))
      },
      enqueueDurationMs: Number((enqueueEnd - enqueueStart).toFixed(2)),
      drainError: drainError ? drainError.message : null
    },
    metrics: snapshot
  };

  if (!silent) {
    logger.info('[notification-load-test] completed', report.summary);
  }

  console.log(JSON.stringify(report, null, 2));

  if (drainError) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    logger.error('[notification-load-test] fatal error', { error: error?.message, stack: error?.stack });
    process.exitCode = 1;
  });
}

export default main;
