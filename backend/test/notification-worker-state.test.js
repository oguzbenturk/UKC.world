import { describe, beforeEach, afterEach, test, expect } from '@jest/globals';
import notificationDispatcher from '../services/notificationDispatcher.js';
import {
  drainWorker,
  getWorkerState,
  __resetWorkerStateForTests
} from '../services/notificationWorkerState.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('notificationWorkerState drain coordination', () => {
  beforeEach(() => {
    notificationDispatcher.clearCaches();
    notificationDispatcher.configure({ concurrency: 1, perTenantLimit: 1 });
    __resetWorkerStateForTests();
  });

  afterEach(() => {
    notificationDispatcher.clearCaches();
  });

  test('drain waits for in-flight jobs to finish', async () => {
    let executed = false;

    notificationDispatcher.enqueue({
      meta: { type: 'test-drain' },
      execute: async () => {
        await sleep(25);
        executed = true;
      }
    });

    const state = await drainWorker({ timeoutMs: 500 });

    expect(executed).toBe(true);
    expect(state.lastDrainResult).toBe('success');
    expect(state.metrics.queueDepth).toBe(0);
    expect(state.metrics.activeJobs).toBe(0);
  });

  test('sequential drain calls reuse in-flight promise', async () => {
    notificationDispatcher.enqueue({
      meta: { type: 'test-drain-reuse' },
      execute: async () => {
        await sleep(10);
      }
    });

    const first = drainWorker({ timeoutMs: 500 });
    const second = drainWorker({ timeoutMs: 500 });

    expect(first).toBe(second);
    const final = await second;
    expect(final.lastDrainResult).toBe('success');
  });

  test('drain propagates timeout errors', async () => {
    notificationDispatcher.enqueue({
      meta: { type: 'test-drain-timeout' },
      execute: async () => {
        await sleep(100);
      }
    });

    await expect(drainWorker({ timeoutMs: 10 })).rejects.toThrow('Notification dispatcher idle wait timed out');

    const state = getWorkerState();
    expect(state.lastDrainResult).toBe('timeout');
    expect(state.lastDrainError).toContain('timed out');
  });
});
