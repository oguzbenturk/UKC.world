import { describe, beforeEach, test, expect } from '@jest/globals';
import notificationMetrics from '../services/metrics/notificationMetrics.js';
import {
  prometheusRegistry,
  resetPrometheusMetrics
} from '../services/metrics/prometheusMetrics.js';

describe('notification metrics Prometheus integration', () => {
  beforeEach(() => {
    notificationMetrics.reset();
    resetPrometheusMetrics();
  });

  test('records queue depth gauge and queued counter', async () => {
    notificationMetrics.recordQueued({ jobType: 'test-job', queueDepth: 5 });

    const metrics = await prometheusRegistry.metrics();
  expect(metrics).toContain('notification_queue_depth{service="plannivo-backend"} 5');
  expect(metrics).toContain('notification_jobs_total{result="queued",job_type="test-job",service="plannivo-backend"} 1');
  });

  test('records processing and failure durations', async () => {
    notificationMetrics.recordProcessed({ jobType: 'test-job', durationMs: 120, waitMs: 45 });
    notificationMetrics.recordFailed(1, new Error('boom'), {
      jobType: 'test-job',
      durationMs: 150,
      waitMs: 60
    });

    const metrics = await prometheusRegistry.metrics();
    expect(metrics).toContain('notification_job_failures_total{reason="Error",job_type="test-job",service="plannivo-backend"} 1');
    expect(metrics).toMatch(/notification_job_duration_ms_sum\{service="plannivo-backend",job_type="test-job"\} [0-9.]+/);
    expect(metrics).toMatch(/notification_job_wait_duration_ms_sum\{service="plannivo-backend",job_type="test-job"\} [0-9.]+/);
  });
});
