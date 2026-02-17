import fs from 'fs';
import path from 'path';
import winston from 'winston';

const LOGS_DIR = path.resolve(process.cwd(), 'logs');

/**
 * Lightweight in-memory metrics aggregator with periodic log snapshots.
 */
class MetricsService {
  constructor() {
    this.interval = null;
    this.windowMs = 60000; // default aggregation window
    this.reset();
    this.logger = this.createLogger();
  }

  createLogger() {
    try {
      if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('MetricsService: Unable to create logs directory:', error.message);
    }

    const transports = [];

    try {
      transports.push(
        new winston.transports.File({
          filename: path.join(LOGS_DIR, 'metrics.log'),
          level: 'info'
        })
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('MetricsService: falling back to console transport:', error.message);
    }

    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    );

    return winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'plannivo-metrics' },
      transports
    });
  }

  start(windowMs = 60000) {
    if (this.interval) {
      return;
    }
    this.windowMs = windowMs;
    this.interval = setInterval(() => {
      try {
        this.flush();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('MetricsService flush error:', error.message);
      }
    }, this.windowMs);

    if (typeof this.interval.unref === 'function') {
      this.interval.unref();
    }
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  reset() {
    this.metrics = {
      requests: {
        total: 0,
        byStatus: {
          success: 0,
          clientError: 0,
          serverError: 0
        },
        durations: {
          totalMs: 0,
          maxMs: 0,
          buckets: {
            sub100: 0,
            sub250: 0,
            sub500: 0,
            sub1000: 0,
            over1000: 0
          }
        }
      },
      cache: {
        hits: 0,
        misses: 0,
        bypassed: 0
      },
      memorySamples: []
    };
  }

  recordRequest({ method, route, status, durationMs, cacheStatus }) {
    if (!route || typeof route !== 'string') {
      route = 'unknown';
    }
    const { requests } = this.metrics;
    requests.total += 1;
    requests.durations.totalMs += durationMs;
    requests.durations.maxMs = Math.max(requests.durations.maxMs, durationMs);

    if (durationMs < 100) {
      requests.durations.buckets.sub100 += 1;
    } else if (durationMs < 250) {
      requests.durations.buckets.sub250 += 1;
    } else if (durationMs < 500) {
      requests.durations.buckets.sub500 += 1;
    } else if (durationMs < 1000) {
      requests.durations.buckets.sub1000 += 1;
    } else {
      requests.durations.buckets.over1000 += 1;
    }

    if (status >= 500) {
      requests.byStatus.serverError += 1;
    } else if (status >= 400) {
      requests.byStatus.clientError += 1;
    } else {
      requests.byStatus.success += 1;
    }

    // Log extremely slow requests immediately for visibility
    if (durationMs >= 2000) {
      this.logger.warn('Slow request detected', {
        method,
        route,
        status,
        durationMs,
        cacheStatus
      });
    }
  }

  recordCacheResult({ hit, bypassed = false }) {
    if (bypassed) {
      this.metrics.cache.bypassed += 1;
    } else if (hit) {
      this.metrics.cache.hits += 1;
    } else {
      this.metrics.cache.misses += 1;
    }
  }

  recordMemoryUsage(usage) {
    this.metrics.memorySamples.push({
      ...usage,
      timestamp: new Date().toISOString()
    });
    if (usage.heapUsed > 150) {
      this.logger.warn('High memory usage', usage);
    }
  }

  getSnapshot({ reset = false } = {}) {
    const averageMs = this.metrics.requests.total > 0
      ? this.metrics.requests.durations.totalMs / this.metrics.requests.total
      : 0;

    const snapshot = {
      generatedAt: new Date().toISOString(),
      windowMs: this.windowMs,
      requests: {
        total: this.metrics.requests.total,
        byStatus: this.metrics.requests.byStatus,
        durations: {
          averageMs: Number(averageMs.toFixed(2)),
          maxMs: Number(this.metrics.requests.durations.maxMs.toFixed(2)),
          buckets: this.metrics.requests.durations.buckets
        }
      },
      cache: this.metrics.cache,
      memory: this.metrics.memorySamples.slice(-5) // last 5 samples for quick view
    };

    if (reset) {
      this.reset();
    }

    return snapshot;
  }

  flush() {
    const snapshot = this.getSnapshot({ reset: true });
    snapshot.type = 'metrics.snapshot';
    this.logger.info(snapshot);
  }
}

export const metricsService = new MetricsService();
export default metricsService;
