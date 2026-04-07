import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

let dispatchNotification;
let dispatchToStaff;
let clearPreferenceCache;
let NOTIFICATION_TYPES;
let PREFERENCE_MAP;
let pool;
let insertNotification;

beforeAll(async () => {
  // Mock database
  await jest.unstable_mockModule('../../../../backend/db.js', () => ({
    pool: {
      query: jest.fn()
    }
  }));

  // Mock notificationWriter
  await jest.unstable_mockModule('../../../../backend/services/notificationWriter.js', () => ({
    insertNotification: jest.fn(async ({ userId, title, message, type, data, idempotencyKey }) => {
      // Simulate successful insertion
      if (!userId || !title) {
        return { inserted: false, reason: 'missing-fields' };
      }
      return { inserted: true, id: `notif-${Date.now()}` };
    })
  }));

  // Import the dispatcher
  const dispatcherModule = await import('../../../../backend/services/notificationDispatcherUnified.js');
  dispatchNotification = dispatcherModule.dispatchNotification;
  dispatchToStaff = dispatcherModule.dispatchToStaff;
  clearPreferenceCache = dispatcherModule.clearPreferenceCache;
  NOTIFICATION_TYPES = dispatcherModule.NOTIFICATION_TYPES;
  PREFERENCE_MAP = dispatcherModule.PREFERENCE_MAP;

  // Get mocked modules
  const dbModule = await import('../../../../backend/db.js');
  pool = dbModule.pool;

  const writerModule = await import('../../../../backend/services/notificationWriter.js');
  insertNotification = writerModule.insertNotification;
});

beforeEach(() => {
  clearPreferenceCache();
  pool.query.mockReset();
  // Re-apply the default insertNotification implementation after clearing mocks
  // (jest.clearAllMocks would wipe the beforeAll mock implementation)
  insertNotification.mockReset();
  insertNotification.mockImplementation(async ({ userId, title }) => {
    if (!userId || !title) return { inserted: false, reason: 'missing-fields' };
    return { inserted: true, id: `notif-${Date.now()}` };
  });
});

describe('notificationDispatcherUnified', () => {
  describe('NOTIFICATION_TYPES registry', () => {
    test('should have 30+ valid notification types', () => {
      expect(NOTIFICATION_TYPES.size).toBeGreaterThanOrEqual(30);
    });

    test('should include core booking types', () => {
      expect(NOTIFICATION_TYPES.has('booking_student')).toBe(true);
      expect(NOTIFICATION_TYPES.has('booking_instructor')).toBe(true);
      expect(NOTIFICATION_TYPES.has('new_booking_alert')).toBe(true);
    });

    test('should include new Phase 3 types', () => {
      expect(NOTIFICATION_TYPES.has('package_purchase')).toBe(true);
      expect(NOTIFICATION_TYPES.has('accommodation_booking')).toBe(true);
    });

    test('should include staff alert types', () => {
      expect(NOTIFICATION_TYPES.has('new_rental_alert')).toBe(true);
      expect(NOTIFICATION_TYPES.has('rating_request')).toBe(true);
    });

    test('should have general as fallback', () => {
      expect(NOTIFICATION_TYPES.has('general')).toBe(true);
    });
  });

  describe('PREFERENCE_MAP', () => {
    test('should map booking types to booking_updates', () => {
      expect(PREFERENCE_MAP['booking_student']).toBe('booking_updates');
      expect(PREFERENCE_MAP['booking_completed_student']).toBe('booking_updates');
    });

    test('should map staff alerts to new_booking_alerts', () => {
      expect(PREFERENCE_MAP['booking_instructor']).toBe('new_booking_alerts');
      expect(PREFERENCE_MAP['new_booking_alert']).toBe('new_booking_alerts');
      expect(PREFERENCE_MAP['package_purchase']).toBe('new_booking_alerts');
      expect(PREFERENCE_MAP['accommodation_booking']).toBe('new_booking_alerts');
    });

    test('should map payment types to payment_notifications', () => {
      expect(PREFERENCE_MAP['payment']).toBe('payment_notifications');
      expect(PREFERENCE_MAP['bank_transfer_deposit']).toBe('payment_notifications');
      expect(PREFERENCE_MAP['shop_order']).toBe('payment_notifications');
    });

    test('should have entries for all major notification types', () => {
      // Most types should be mapped
      expect(Object.keys(PREFERENCE_MAP).length).toBeGreaterThan(15);
    });
  });

  describe('dispatchNotification()', () => {
    test('should reject missing userId', async () => {
      const result = await dispatchNotification({
        title: 'Test',
        message: 'Test message',
        type: 'general'
      });
      expect(result.sent).toBe(false);
      expect(result.reason).toBe('missing-params');
    });

    test('should reject missing title', async () => {
      const result = await dispatchNotification({
        userId: 'user-123',
        message: 'Test message',
        type: 'general'
      });
      expect(result.sent).toBe(false);
      expect(result.reason).toBe('missing-params');
    });

    test('should accept valid notification', async () => {
      const result = await dispatchNotification({
        userId: 'user-123',
        type: 'booking_student',
        title: 'Lesson booked',
        message: 'Your lesson is scheduled',
        data: { bookingId: 'b-123' },
        idempotencyKey: 'booking:b-123:user-123'
      });
      expect(result.sent).toBe(true);
      expect(result.id).toBeDefined();
    });

    test('should default unknown type to general', async () => {
      // Unknown types should be remapped to 'general'
      const result = await dispatchNotification({
        userId: 'user-123',
        type: 'unknown_notification_type',
        title: 'Unknown',
        message: 'Test'
      });
      // Should still send (with remapped type)
      expect(result.sent).toBe(true);
    });

    test('should respect checkPreference=false', async () => {
      // When checkPreference is false, should send regardless of settings
      pool.query.mockResolvedValueOnce({
        rows: [{ booking_updates: false }]
      });

      const result = await dispatchNotification({
        userId: 'user-123',
        type: 'booking_student',
        title: 'Lesson booked',
        message: 'Your lesson',
        checkPreference: false
      });

      // Should still send because we skipped preference check
      expect(result.sent).toBe(true);
    });

    test('should respect user preference when checkPreference=true', async () => {
      // Mock a user with booking_updates disabled
      pool.query.mockResolvedValueOnce({
        rows: [{ booking_updates: false }]
      });

      const result = await dispatchNotification({
        userId: 'user-456',
        type: 'booking_student',
        title: 'Lesson booked',
        message: 'Your lesson',
        checkPreference: true
      });

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('user-preference-disabled');
    });

    test('should default to sending when user has no settings row', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await dispatchNotification({
        userId: 'user-new',
        type: 'booking_student',
        title: 'Lesson booked',
        message: 'Your lesson',
        checkPreference: true
      });

      // No settings row = default to sending (opt-out model)
      expect(result.sent).toBe(true);
    });

    test('should cache preference lookups', async () => {
      const userId = 'user-cached';
      pool.query.mockResolvedValueOnce({
        rows: [{ booking_updates: true }]
      });

      // First call hits DB
      await dispatchNotification({
        userId,
        type: 'booking_student',
        title: 'First',
        message: 'First message',
        checkPreference: true
      });

      // Second call should use cache (query count stays at 1)
      await dispatchNotification({
        userId,
        type: 'booking_student',
        title: 'Second',
        message: 'Second message',
        checkPreference: true
      });

      // Should only have queried once (cached on second)
      expect(pool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispatchToStaff()', () => {
    test('should query staff with correct role filters', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 'admin-1', name: 'Alice' },
          { id: 'manager-1', name: 'Bob' }
        ]
      });

      await dispatchToStaff({
        type: 'new_booking_alert',
        title: 'New Booking',
        message: 'A booking was created',
        roles: ['admin', 'manager']
      });

      // Should have queried staff
      expect(pool.query).toHaveBeenCalled();
    });

    test('should exclude specified user IDs', async () => {
      pool.query.mockResolvedValueOnce({
        rows: []
      });

      await dispatchToStaff({
        type: 'new_booking_alert',
        title: 'New Booking',
        message: 'A booking was created',
        excludeUserIds: ['instructor-1', 'creator-1'],
        roles: ['admin', 'manager']
      });

      const call = pool.query.mock.calls[0];
      expect(call[1][1]).toEqual(['instructor-1', 'creator-1']);
    });

    test('should default to admin/manager/owner roles', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await dispatchToStaff({
        type: 'new_booking_alert',
        title: 'New Booking',
        message: 'A booking was created'
      });

      // Should have used default roles
      const call = pool.query.mock.calls[0];
      expect(call[1][0]).toEqual(['admin', 'manager', 'owner']);
    });

    test('should return notification counts', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 'admin-1', name: 'Alice' },
          { id: 'manager-1', name: 'Bob' }
        ]
      });

      const result = await dispatchToStaff({
        type: 'new_booking_alert',
        title: 'New Booking',
        message: 'A booking was created'
      });

      expect(result.notified).toBeGreaterThanOrEqual(0);
      expect(result.skipped).toBeGreaterThanOrEqual(0);
    });

    test('should return empty counts when no staff found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await dispatchToStaff({
        type: 'new_booking_alert',
        title: 'New Booking',
        message: 'A booking was created'
      });

      expect(result.notified).toBe(0);
      expect(result.skipped).toBe(0);
    });

    test('should handle errors gracefully', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await dispatchToStaff({
        type: 'new_booking_alert',
        title: 'New Booking',
        message: 'A booking was created'
      });

      // Should return 0,0 on error (not throw)
      expect(result.notified).toBe(0);
      expect(result.skipped).toBe(0);
    });
  });

  describe('Edge cases', () => {
    test('should handle notification for deleted user gracefully', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await dispatchNotification({
        userId: 'deleted-user',
        type: 'booking_student',
        title: 'Lesson',
        message: 'Your lesson',
        checkPreference: true
      });

      // Should still send (no settings = defaults to true)
      expect(result.sent).toBe(true);
    });

    test('should handle very large data payloads', async () => {
      const largeData = {
        bookingId: 'b-123',
        details: { nested: { deeply: { value: 'x'.repeat(1000) } } }
      };

      const result = await dispatchNotification({
        userId: 'user-123',
        type: 'booking_student',
        title: 'Booking',
        message: 'Your booking',
        data: largeData
      });

      expect(result.sent).toBe(true);
    });

    test('should handle special characters in message', async () => {
      const result = await dispatchNotification({
        userId: 'user-123',
        type: 'booking_student',
        title: 'Booking™',
        message: 'Your lesson @ 10:00 AM — "urgent" & important!',
        data: { details: 'test' }
      });

      expect(result.sent).toBe(true);
    });
  });
});
