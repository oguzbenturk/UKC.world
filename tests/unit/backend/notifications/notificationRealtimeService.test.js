import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

let notificationRealtimeService;

beforeEach(async () => {
  // Reset mocks before each test
  jest.clearAllMocks();

  // Register ESM mocks before importing the SUT
  await jest.unstable_mockModule('../../../../backend/db.js', () => ({
    pool: {
      connect: jest.fn(),
    },
  }));

  await jest.unstable_mockModule('../../../../backend/middlewares/errorHandler.js', () => ({
    logger: {
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    },
  }));

  await jest.unstable_mockModule('../../../../backend/services/socketService.js', () => ({
    default: {
      emitToChannel: jest.fn(),
    },
  }));

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../../backend/services/notificationRealtimeService.js');
    notificationRealtimeService = mod.default;
  });
});

afterEach(async () => {
  // Clean up after each test
  if (notificationRealtimeService) {
    await notificationRealtimeService.shutdown();
  }
});

describe('NotificationRealtimeService', () => {
  describe('initialization', () => {
    test('should initialize successfully when pool is available', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({}),
        on: jest.fn(),
        release: jest.fn(),
      };

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      await notificationRealtimeService.initialize();

      expect(notificationRealtimeService.isListening).toBe(true);
      expect(notificationRealtimeService.failedAttempts).toBe(0);
      expect(mockClient.query).toHaveBeenCalledWith('LISTEN notification_events');
    });

    test('should skip initialization when pool is unavailable', async () => {
      const { pool } = await import('../../../../backend/db.js');
      pool.connect = jest.fn().mockResolvedValue(null);

      await notificationRealtimeService.initialize();

      expect(notificationRealtimeService.isListening).toBe(false);
    });

    test('should not reinitialize if already listening', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({}),
        on: jest.fn(),
        release: jest.fn(),
      };

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      await notificationRealtimeService.initialize();
      const firstConnect = pool.connect.mock.calls.length;

      await notificationRealtimeService.initialize();

      // Should not call connect again
      expect(pool.connect.mock.calls.length).toBe(firstConnect);
    });

    test('should retry on failure up to maxFailedAttempts', async () => {
      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockRejectedValueOnce(new Error('Connection failed'));

      await notificationRealtimeService.initialize();

      expect(notificationRealtimeService.failedAttempts).toBe(1);
      expect(notificationRealtimeService.isListening).toBe(false);
    });

    test('should stop retrying after maxFailedAttempts reached', async () => {
      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockRejectedValue(new Error('Connection failed'));

      // Simulate 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await notificationRealtimeService.initialize();
      }

      expect(notificationRealtimeService.failedAttempts).toBe(3);
      expect(notificationRealtimeService.isListening).toBe(false);
    });
  });

  describe('shutdown', () => {
    test('should shutdown gracefully when listening', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({}),
        on: jest.fn(),
        release: jest.fn(),
      };

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      await notificationRealtimeService.initialize();
      await notificationRealtimeService.shutdown();

      expect(mockClient.query).toHaveBeenCalledWith('UNLISTEN notification_events');
      expect(mockClient.release).toHaveBeenCalled();
      expect(notificationRealtimeService.isListening).toBe(false);
    });

    test('should handle UNLISTEN errors gracefully', async () => {
      const mockClient = {
        query: jest.fn().mockRejectedValueOnce(new Error('UNLISTEN failed')),
        on: jest.fn(),
        release: jest.fn(),
      };

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      await notificationRealtimeService.initialize();
      await notificationRealtimeService.shutdown();

      expect(notificationRealtimeService.isListening).toBe(false);
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should clear retry timer on shutdown', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({}),
        on: jest.fn(),
        release: jest.fn(),
      };

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      await notificationRealtimeService.initialize();
      await notificationRealtimeService.shutdown();

      expect(notificationRealtimeService.retryTimer).toBeNull();
    });
  });

  describe('restart', () => {
    test('should schedule retry when restart called', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({}),
        on: jest.fn(),
        release: jest.fn(),
      };

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      await notificationRealtimeService.initialize();
      const timerBefore = notificationRealtimeService.retryTimer;

      notificationRealtimeService.restart();

      expect(notificationRealtimeService.isListening).toBe(false);
      expect(notificationRealtimeService.retryTimer).not.toBeNull();
    });

    test('should not schedule duplicate retries', async () => {
      notificationRealtimeService.retryTimer = setTimeout(() => {}, 5000);

      notificationRealtimeService.restart();
      notificationRealtimeService.restart();

      // Should only have one retry scheduled
      expect(notificationRealtimeService.retryTimer).not.toBeNull();
    });
  });

  describe('handleNotification', () => {
    test('should emit to correct channel for INSERT operation', async () => {
      const socketServiceMod = await import('../../../../backend/services/socketService.js');

      const payload = {
        operation: 'INSERT',
        notification: {
          id: '123',
          user_id: 'user-456',
          title: 'Test Notification',
        },
      };

      notificationRealtimeService.handleNotification(JSON.stringify(payload));

      expect(socketServiceMod.default.emitToChannel).toHaveBeenCalledWith(
        'user:user-456',
        'notification:new',
        { notification: payload.notification }
      );
    });

    test('should emit to correct channel for UPDATE operation', async () => {
      const socketServiceMod = await import('../../../../backend/services/socketService.js');

      const payload = {
        operation: 'UPDATE',
        notification: {
          id: '123',
          user_id: 'user-789',
          title: 'Updated Notification',
        },
      };

      notificationRealtimeService.handleNotification(JSON.stringify(payload));

      expect(socketServiceMod.default.emitToChannel).toHaveBeenCalledWith(
        'user:user-789',
        'notification:update',
        { notification: payload.notification }
      );
    });

    test('should ignore payload without user_id', async () => {
      const socketServiceMod = await import('../../../../backend/services/socketService.js');

      const payload = {
        operation: 'INSERT',
        notification: {
          id: '123',
          title: 'Test',
        },
      };

      notificationRealtimeService.handleNotification(JSON.stringify(payload));

      expect(socketServiceMod.default.emitToChannel).not.toHaveBeenCalled();
    });

    test('should ignore empty payloads', async () => {
      const socketServiceMod = await import('../../../../backend/services/socketService.js');

      notificationRealtimeService.handleNotification(null);
      notificationRealtimeService.handleNotification('');
      notificationRealtimeService.handleNotification(undefined);

      expect(socketServiceMod.default.emitToChannel).not.toHaveBeenCalled();
    });

    test('should handle malformed JSON gracefully', async () => {
      const { logger } = await import('../../../../backend/middlewares/errorHandler.js');

      notificationRealtimeService.handleNotification('{ invalid json }');

      expect(logger.warn).toHaveBeenCalled();
    });

    test('should ignore payloads with wrong channel', async () => {
      const socketServiceMod = await import('../../../../backend/services/socketService.js');

      const mockClient = {
        query: jest.fn().mockResolvedValue({}),
        on: jest.fn(),
        release: jest.fn(),
      };

      const { pool } = await import('../../../../backend/db.js');
      pool.connect.mockResolvedValue(mockClient);

      await notificationRealtimeService.initialize();

      // Simulate notification with wrong channel
      const notificationEvent = mockClient.on.mock.calls.find(call => call[0] === 'notification');
      if (notificationEvent) {
        notificationEvent[1]({
          channel: 'wrong_channel',
          payload: JSON.stringify({ notification: { user_id: 'user-1' } }),
        });
      }

      expect(socketServiceMod.default.emitToChannel).not.toHaveBeenCalled();
    });
  });
});
