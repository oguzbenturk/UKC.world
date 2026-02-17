import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals';
import { EventEmitter } from 'events';

describe('database guardrails', () => {
  let mockLogger;
  let pool;
  let getPoolStats;
  let mockPerformanceNow;

  beforeEach(async () => {
  jest.resetModules();

    process.env.DB_POOL_METRICS_INTERVAL_MS = '0';
    process.env.DB_SLOW_QUERY_THRESHOLD_MS = '100';
    process.env.DB_POOL_WARN_MAX_WAITING = '0';
    process.env.DB_POOL_WARN_ACQUIRE_MS = '0';
    process.env.DB_POOL_WARN_DEBOUNCE_MS = '0';
    process.env.RUN_DB_MIGRATIONS = 'false';

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    const clientQueryMock = jest.fn(async () => ({ rows: [] }));

    class StubPool extends EventEmitter {
      constructor() {
        super();
        this.totalCount = 1;
        this.idleCount = 1;
        this.waitingCount = 0;
        this._client = this._createClient();
      }

      _createClient() {
        const client = {
          query: clientQueryMock,
          release: jest.fn(() => {
            this.idleCount = 1;
            this.emit('release', client);
          })
        };
        return client;
      }

      async query(...args) {
        this.totalCount = 1;
        this.idleCount = 0;
        this.emit('acquire', this._client);
        const result = await clientQueryMock(...args);
        this.idleCount = 1;
        this.emit('release', this._client);
        return result;
      }

      async connect() {
        this.totalCount = 1;
        this.idleCount = 0;
        this.emit('connect', this._client);
        this.emit('acquire', this._client);
        return this._client;
      }
    }

    // Performance.now mock: alternates between 0 and 150 for each pair of calls
    // This ensures each query measures 150ms duration which exceeds 100ms threshold
    let callCount = 0;
    mockPerformanceNow = jest.fn(() => {
      // Every odd call (start) returns 0, every even call (end) returns 150
      const val = (callCount % 2 === 0) ? 0 : 150;
      callCount++;
      return val;
    });
    const mockPerformance = {
      now: mockPerformanceNow
    };

    await jest.unstable_mockModule('node:perf_hooks', () => ({
      performance: mockPerformance
    }));

    await jest.unstable_mockModule('pg', () => ({
      default: { Pool: StubPool },
      Pool: StubPool
    }));

    await jest.unstable_mockModule('../middlewares/errorHandler.js', () => ({
      logger: mockLogger
    }));

    const dbModule = await import('../db.js');
    pool = dbModule.pool;
    getPoolStats = dbModule.getPoolStats;

    await Promise.resolve();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();

    delete process.env.DB_POOL_METRICS_INTERVAL_MS;
    delete process.env.DB_SLOW_QUERY_THRESHOLD_MS;
    delete process.env.DB_POOL_WARN_MAX_WAITING;
    delete process.env.DB_POOL_WARN_ACQUIRE_MS;
    delete process.env.DB_POOL_WARN_DEBOUNCE_MS;
    delete process.env.RUN_DB_MIGRATIONS;
  });

  test('logs slow query warnings via pool guardrails', async () => {
    // Clear mocks and reset call count to ensure clean state
    jest.clearAllMocks();
    mockPerformanceNow.mockClear();
    
    await pool.query('SELECT * FROM bookings WHERE id = $1', ['123']);
    
    const warnCalls = mockLogger.warn.mock.calls.filter(([message]) => message === 'Slow database query detected');
    expect(warnCalls).toHaveLength(1);
    const [, metadata] = warnCalls[0];
    expect(metadata).toMatchObject({
      source: 'pool',
      paramsCount: 1,
      sqlPreview: 'SELECT * FROM bookings WHERE id = $1'
    });
  });

  test('getPoolStats exposes saturation metrics', () => {
    const stats = getPoolStats();
    expect(stats).toMatchObject({
      totalCount: expect.any(Number),
      idleCount: expect.any(Number),
      waitingCount: expect.any(Number),
      inUseCount: expect.any(Number),
      saturationPct: expect.any(Number)
    });
  });
});
