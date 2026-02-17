import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals';

describe('NotificationDispatcher fairness and priority', () => {
  let NotificationDispatcher;
  let dispatcher;
  let metricsMock;
  let loggerMock;

  const createMetricsMock = () => ({
    recordQueued: jest.fn(),
    recordProcessed: jest.fn(),
    recordFailed: jest.fn(),
    recordRetry: jest.fn(),
    recordRetryScheduled: jest.fn(),
    recordDeduplicated: jest.fn(),
    recordDropped: jest.fn(),
    updateQueueDepth: jest.fn(),
    updateActiveJobs: jest.fn(),
    reset: jest.fn(),
    logSnapshot: jest.fn()
  });

  beforeEach(async () => {
    jest.resetModules();
    metricsMock = createMetricsMock();
    loggerMock = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    await jest.unstable_mockModule('../services/metrics/notificationMetrics.js', () => ({
      default: metricsMock,
      notificationMetrics: metricsMock
    }));

    await jest.unstable_mockModule('../middlewares/errorHandler.js', () => ({
      logger: loggerMock
    }));

    const module = await import('../services/notificationDispatcher.js');
    ({ NotificationDispatcher } = module);
    dispatcher = new NotificationDispatcher();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const waitForIdle = () => dispatcher.awaitIdle({ timeoutMs: 200 });

  const makeJob = ({ id, tenantKey, priority = 0, durationMs = 0 }) => ({
    meta: { id },
    tenantKey,
    priority,
    execute: jest.fn(() =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve();
        }, durationMs);
      })
    )
  });

  test('rotates tenants to prevent starvation', async () => {
    dispatcher.configure({ concurrency: 2, perTenantLimit: 1 });
    const order = [];

    const jobA1 = {
      ...makeJob({ id: 'A1', tenantKey: 'tenant-a' }),
      execute: jest.fn(async () => {
        order.push('A1');
      })
    };

    const jobA2 = {
      ...makeJob({ id: 'A2', tenantKey: 'tenant-a' }),
      execute: jest.fn(async () => {
        order.push('A2');
      })
    };

    const jobB1 = {
      ...makeJob({ id: 'B1', tenantKey: 'tenant-b' }),
      execute: jest.fn(async () => {
        order.push('B1');
      })
    };

    dispatcher.enqueue(jobA1);
    dispatcher.enqueue(jobA2);
    dispatcher.enqueue(jobB1);

    await waitForIdle();

    expect(order[0]).toBe('A1');
    expect(order[1]).toBe('B1');
    expect(order[2]).toBe('A2');
  });

  test('honors job priority within tenant queue', async () => {
    dispatcher.configure({ concurrency: 1, perTenantLimit: 1 });
    const order = [];

    const lowPriorityJob = {
      ...makeJob({ id: 'low', tenantKey: 'tenant-x', priority: 0 }),
      execute: jest.fn(async () => {
        order.push('low');
      })
    };

    const highPriorityJob = {
      ...makeJob({ id: 'high', tenantKey: 'tenant-x', priority: 10 }),
      execute: jest.fn(async () => {
        order.push('high');
      })
    };

    dispatcher.enqueue(lowPriorityJob);
    dispatcher.enqueue(highPriorityJob);

    await waitForIdle();

    expect(order).toEqual(['high', 'low']);
  });

  test('deduplicates jobs sharing the same idempotency key', async () => {
    dispatcher.configure({ concurrency: 1, perTenantLimit: 1 });

    const jobOne = {
      ...makeJob({ id: 'dedupe-1', tenantKey: 'tenant-z' }),
      idempotencyKey: 'notif::tenant-z::digest',
      meta: { type: 'digest' },
      execute: jest.fn(async () => undefined)
    };

    const jobTwo = {
      ...makeJob({ id: 'dedupe-2', tenantKey: 'tenant-z' }),
      idempotencyKey: 'notif::tenant-z::digest',
      meta: { type: 'digest' },
      execute: jest.fn(async () => undefined)
    };

    dispatcher.enqueue(jobOne);
    dispatcher.enqueue(jobTwo);

    await waitForIdle();

    expect(jobOne.execute).toHaveBeenCalledTimes(1);
    expect(jobTwo.execute).not.toHaveBeenCalled();
    expect(metricsMock.recordDeduplicated).toHaveBeenCalledWith({ jobType: 'digest' });
    expect(metricsMock.recordQueued).toHaveBeenCalledTimes(1);
  });

  test('evicts oldest job when capacity is exceeded', async () => {
    jest.resetModules();
    process.env.NOTIFICATION_MAX_QUEUE_LENGTH = '2';

    const localMetricsMock = createMetricsMock();
    const localLoggerMock = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    await jest.unstable_mockModule('../services/metrics/notificationMetrics.js', () => ({
      default: localMetricsMock,
      notificationMetrics: localMetricsMock
    }));

    await jest.unstable_mockModule('../middlewares/errorHandler.js', () => ({
      logger: localLoggerMock
    }));

    const module = await import('../services/notificationDispatcher.js');
    const LocalDispatcher = module.NotificationDispatcher;
    const localDispatcher = new LocalDispatcher();
    localDispatcher.configure({ concurrency: 1, perTenantLimit: 1 });

    const jobOne = {
      meta: { type: 'alpha' },
      execute: jest.fn(async () => undefined)
    };

    const jobTwo = {
      meta: { type: 'beta' },
      execute: jest.fn(async () => undefined)
    };

    const jobThree = {
      meta: { type: 'gamma' },
      execute: jest.fn(async () => undefined)
    };

    try {
      localDispatcher.enqueue(jobOne);
      localDispatcher.enqueue(jobTwo);
      localDispatcher.enqueue(jobThree);

      await localDispatcher.awaitIdle({ timeoutMs: 200 });

      expect(jobOne.execute).not.toHaveBeenCalled();
      expect(jobTwo.execute).toHaveBeenCalledTimes(1);
      expect(jobThree.execute).toHaveBeenCalledTimes(1);
      expect(localMetricsMock.recordDropped).toHaveBeenCalledWith('capacity', { jobType: 'alpha' });
    } finally {
      delete process.env.NOTIFICATION_MAX_QUEUE_LENGTH;
    }
  });
});
