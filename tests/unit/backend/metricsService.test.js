import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import metricsService from '../../../backend/services/metricsService.js';

describe('metricsService', () => {
  afterEach(() => {
    metricsService.stop();
  });

  describe('recordRequest', () => {
    beforeEach(() => {
      metricsService.reset();
    });

    test('increments total request count', () => {
      metricsService.recordRequest({
        method: 'GET',
        route: '/api/users',
        status: 200,
        durationMs: 50,
        cacheStatus: 'hit'
      });

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.requests.total).toBe(1);
    });

    test('categorizes status codes correctly', () => {
      metricsService.recordRequest({ method: 'GET', route: '/api/users', status: 200, durationMs: 50 });
      metricsService.recordRequest({ method: 'POST', route: '/api/users', status: 201, durationMs: 100 });
      metricsService.recordRequest({ method: 'GET', route: '/api/invalid', status: 400, durationMs: 30 });
      metricsService.recordRequest({ method: 'GET', route: '/api/error', status: 500, durationMs: 500 });

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.requests.total).toBe(4);
      expect(snapshot.requests.byStatus.success).toBe(2);
      expect(snapshot.requests.byStatus.clientError).toBe(1);
      expect(snapshot.requests.byStatus.serverError).toBe(1);
    });

    test('buckets request durations correctly', () => {
      metricsService.recordRequest({ method: 'GET', route: '/api/1', status: 200, durationMs: 50 });
      metricsService.recordRequest({ method: 'GET', route: '/api/2', status: 200, durationMs: 150 });
      metricsService.recordRequest({ method: 'GET', route: '/api/3', status: 200, durationMs: 400 });
      metricsService.recordRequest({ method: 'GET', route: '/api/4', status: 200, durationMs: 700 });
      metricsService.recordRequest({ method: 'GET', route: '/api/5', status: 200, durationMs: 2500 });

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.requests.durations.buckets.sub100).toBe(1);
      expect(snapshot.requests.durations.buckets.sub250).toBe(1);
      expect(snapshot.requests.durations.buckets.sub500).toBe(1);
      expect(snapshot.requests.durations.buckets.sub1000).toBe(1);
      expect(snapshot.requests.durations.buckets.over1000).toBe(1);
    });

    test('calculates max duration correctly', () => {
      metricsService.recordRequest({ method: 'GET', route: '/api/1', status: 200, durationMs: 100 });
      metricsService.recordRequest({ method: 'GET', route: '/api/2', status: 200, durationMs: 500 });
      metricsService.recordRequest({ method: 'GET', route: '/api/3', status: 200, durationMs: 250 });

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.requests.durations.maxMs).toBe(500);
    });

    test('handles zero duration', () => {
      metricsService.recordRequest({ method: 'GET', route: '/api/users', status: 200, durationMs: 0 });
      const snapshot = metricsService.getSnapshot();
      expect(snapshot.requests.durations.buckets.sub100).toBe(1);
    });

    test('handles missing route gracefully', () => {
      expect(() => {
        metricsService.recordRequest({ method: 'GET', route: null, status: 200, durationMs: 50 });
      }).not.toThrow();

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.requests.total).toBe(1);
    });

    test('calculates average duration correctly', () => {
      metricsService.recordRequest({ method: 'GET', route: '/api/1', status: 200, durationMs: 100 });
      metricsService.recordRequest({ method: 'GET', route: '/api/2', status: 200, durationMs: 200 });

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.requests.durations.averageMs).toBe(150);
    });

    test('returns average as 0 when no requests recorded', () => {
      const snapshot = metricsService.getSnapshot();
      expect(snapshot.requests.durations.averageMs).toBe(0);
    });

    test('accumulates duration totals', () => {
      metricsService.recordRequest({ method: 'GET', route: '/api/1', status: 200, durationMs: 100 });
      metricsService.recordRequest({ method: 'GET', route: '/api/2', status: 200, durationMs: 50 });

      const snapshot = metricsService.getSnapshot();
      // totalMs is used internally to calculate average, not directly exposed
      expect(snapshot.requests.durations.averageMs).toBe(75);
    });
  });

  describe('recordCacheResult', () => {
    beforeEach(() => {
      metricsService.reset();
    });

    test('counts cache hits', () => {
      metricsService.recordCacheResult({ hit: true });
      metricsService.recordCacheResult({ hit: true });

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.cache.hits).toBe(2);
    });

    test('counts cache misses', () => {
      metricsService.recordCacheResult({ hit: false });
      metricsService.recordCacheResult({ hit: false });

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.cache.misses).toBe(2);
    });

    test('counts bypassed cache', () => {
      metricsService.recordCacheResult({ hit: true, bypassed: true });
      metricsService.recordCacheResult({ hit: false, bypassed: true });

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.cache.bypassed).toBe(2);
    });

    test('prioritizes bypassed flag over hit status', () => {
      metricsService.recordCacheResult({ hit: true, bypassed: true });

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.cache.hits).toBe(0);
      expect(snapshot.cache.misses).toBe(0);
      expect(snapshot.cache.bypassed).toBe(1);
    });
  });

  describe('recordMemoryUsage', () => {
    beforeEach(() => {
      metricsService.reset();
    });

    test('records memory samples', () => {
      metricsService.recordMemoryUsage({ heapUsed: 50, heapTotal: 100, rss: 150 });
      metricsService.recordMemoryUsage({ heapUsed: 75, heapTotal: 100, rss: 175 });

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.memory.length).toBe(2);
      expect(snapshot.memory[0].heapUsed).toBe(50);
      expect(snapshot.memory[1].heapUsed).toBe(75);
    });

    test('includes timestamp on memory samples', () => {
      metricsService.recordMemoryUsage({ heapUsed: 50, heapTotal: 100 });

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.memory[0].timestamp).toBeDefined();
      expect(typeof snapshot.memory[0].timestamp).toBe('string');
    });

    test('keeps only last 5 memory samples in snapshot', () => {
      for (let i = 0; i < 10; i++) {
        metricsService.recordMemoryUsage({ heapUsed: i * 10, heapTotal: 100 });
      }

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.memory.length).toBe(5);
      // Should be the last 5 samples
      expect(snapshot.memory[0].heapUsed).toBe(50);
      expect(snapshot.memory[4].heapUsed).toBe(90);
    });
  });

  describe('getSnapshot', () => {
    beforeEach(() => {
      metricsService.reset();
    });

    test('returns snapshot with correct structure', () => {
      metricsService.recordRequest({ method: 'GET', route: '/api/users', status: 200, durationMs: 50 });

      const snapshot = metricsService.getSnapshot();

      expect(snapshot).toHaveProperty('generatedAt');
      expect(snapshot).toHaveProperty('windowMs');
      expect(snapshot).toHaveProperty('requests');
      expect(snapshot).toHaveProperty('cache');
      expect(snapshot).toHaveProperty('memory');
    });

    test('resets metrics after snapshot when reset=true', () => {
      metricsService.recordRequest({ method: 'GET', route: '/api/users', status: 200, durationMs: 50 });

      const snapshot1 = metricsService.getSnapshot({ reset: true });
      expect(snapshot1.requests.total).toBe(1);

      const snapshot2 = metricsService.getSnapshot();
      expect(snapshot2.requests.total).toBe(0);
    });

    test('does not reset metrics when reset=false', () => {
      metricsService.recordRequest({ method: 'GET', route: '/api/users', status: 200, durationMs: 50 });

      const snapshot1 = metricsService.getSnapshot({ reset: false });
      expect(snapshot1.requests.total).toBe(1);

      const snapshot2 = metricsService.getSnapshot({ reset: false });
      expect(snapshot2.requests.total).toBe(1);
    });

    test('default reset behavior is false', () => {
      metricsService.recordRequest({ method: 'GET', route: '/api/users', status: 200, durationMs: 50 });

      const snapshot1 = metricsService.getSnapshot();
      expect(snapshot1.requests.total).toBe(1);

      const snapshot2 = metricsService.getSnapshot();
      expect(snapshot2.requests.total).toBe(1);
    });

    test('returns ISO formatted timestamp', () => {
      const snapshot = metricsService.getSnapshot();
      expect(snapshot.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('rounds average duration to 2 decimal places', () => {
      metricsService.recordRequest({ method: 'GET', route: '/api/1', status: 200, durationMs: 100 });
      metricsService.recordRequest({ method: 'GET', route: '/api/2', status: 200, durationMs: 75 });

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.requests.durations.averageMs).toBe(87.5);
    });

    test('rounds max duration to 2 decimal places', () => {
      metricsService.recordRequest({ method: 'GET', route: '/api/1', status: 200, durationMs: 123.456 });

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.requests.durations.maxMs).toBe(123.46);
    });
  });

  describe('start/stop', () => {
    test('starts periodic flush interval', (done) => {
      metricsService.reset();
      const flushSpy = jest.spyOn(metricsService, 'flush');

      metricsService.start(100); // 100ms interval for testing
      metricsService.recordRequest({ method: 'GET', route: '/api/users', status: 200, durationMs: 50 });

      setTimeout(() => {
        expect(flushSpy).toHaveBeenCalled();
        flushSpy.mockRestore();
        done();
      }, 150);
    });

    test('stop clears interval', () => {
      metricsService.start(100);
      expect(metricsService.interval).toBeDefined();

      metricsService.stop();
      expect(metricsService.interval).toBeNull();
    });

    test('prevents duplicate intervals', () => {
      metricsService.start(100);
      const firstInterval = metricsService.interval;

      metricsService.start(100);
      expect(metricsService.interval).toBe(firstInterval);
    });
  });

  describe('reset', () => {
    test('clears all metrics', () => {
      metricsService.recordRequest({ method: 'GET', route: '/api/users', status: 200, durationMs: 50 });
      metricsService.recordCacheResult({ hit: true });
      metricsService.recordMemoryUsage({ heapUsed: 50, heapTotal: 100 });

      metricsService.reset();

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.requests.total).toBe(0);
      expect(snapshot.cache.hits).toBe(0);
      expect(snapshot.memory.length).toBe(0);
    });

    test('resets all duration buckets', () => {
      metricsService.recordRequest({ method: 'GET', route: '/api/1', status: 200, durationMs: 50 });
      metricsService.recordRequest({ method: 'GET', route: '/api/2', status: 200, durationMs: 500 });

      metricsService.reset();

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.requests.durations.buckets.sub100).toBe(0);
      expect(snapshot.requests.durations.buckets.sub500).toBe(0);
      expect(snapshot.requests.durations.averageMs).toBe(0);
      expect(snapshot.requests.durations.maxMs).toBe(0);
    });

    test('resets all status counters', () => {
      metricsService.recordRequest({ method: 'GET', route: '/api/users', status: 200, durationMs: 50 });
      metricsService.recordRequest({ method: 'POST', route: '/api/users', status: 400, durationMs: 50 });
      metricsService.recordRequest({ method: 'DELETE', route: '/api/users', status: 500, durationMs: 50 });

      metricsService.reset();

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.requests.byStatus.success).toBe(0);
      expect(snapshot.requests.byStatus.clientError).toBe(0);
      expect(snapshot.requests.byStatus.serverError).toBe(0);
    });
  });

  describe('flush', () => {
    test('calls getSnapshot with reset=true', () => {
      metricsService.reset();
      const getSnapshotSpy = jest.spyOn(metricsService, 'getSnapshot');

      metricsService.recordRequest({ method: 'GET', route: '/api/users', status: 200, durationMs: 50 });
      metricsService.flush();

      expect(getSnapshotSpy).toHaveBeenCalledWith({ reset: true });
      getSnapshotSpy.mockRestore();
    });

    test('resets metrics after flush', () => {
      metricsService.reset();
      metricsService.recordRequest({ method: 'GET', route: '/api/users', status: 200, durationMs: 50 });

      metricsService.flush();

      const snapshot = metricsService.getSnapshot();
      expect(snapshot.requests.total).toBe(0);
    });
  });
});
