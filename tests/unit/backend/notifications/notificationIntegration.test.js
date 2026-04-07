import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

let dispatchNotification;
let dispatchToStaff;
let clearPreferenceCache;
let pool;

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
      if (!userId || !title) {
        return { inserted: false, reason: 'missing-fields' };
      }
      return { inserted: true, id: `notif-${Date.now()}` };
    })
  }));

  // Import dispatcher
  const dispatcherModule = await import('../../../../backend/services/notificationDispatcherUnified.js');
  dispatchNotification = dispatcherModule.dispatchNotification;
  dispatchToStaff = dispatcherModule.dispatchToStaff;
  clearPreferenceCache = dispatcherModule.clearPreferenceCache;

  // Get mocked modules
  const dbModule = await import('../../../../backend/db.js');
  pool = dbModule.pool;

  const writerModule = await import('../../../../backend/services/notificationWriter.js');
  var _insertNotification = writerModule.insertNotification;

  // Store reference for beforeEach re-application
  globalThis.__testInsertNotification = _insertNotification;
});

beforeEach(() => {
  clearPreferenceCache();
  pool.query.mockReset();
  // Re-apply insertNotification implementation (jest.clearAllMocks wipes beforeAll mocks)
  const mockFn = globalThis.__testInsertNotification;
  if (mockFn) {
    mockFn.mockReset();
    mockFn.mockImplementation(async ({ userId, title }) => {
      if (!userId || !title) return { inserted: false, reason: 'missing-fields' };
      return { inserted: true, id: `notif-${Date.now()}` };
    });
  }
});

describe('Notification Integration Tests', () => {
  describe('Package Purchase Flow', () => {
    test('should notify staff when customer purchases package', async () => {
      const packageId = 'pkg-123';
      const customerId = 'customer-456';

      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 'admin-001', name: 'Alice Admin' },
          { id: 'manager-001', name: 'Bob Manager' }
        ]
      });

      const staffResult = await dispatchToStaff({
        type: 'package_purchase',
        title: 'New Package Purchase',
        message: 'Customer purchased Beginner Kite Package',
        data: {
          packageId,
          customerUserId: customerId,
          amount: 299.99,
          currency: 'EUR',
          cta: { label: 'View Package', href: `/admin/customers/${customerId}/packages` }
        },
        idempotencyPrefix: `package-purchase:${packageId}`,
        excludeUserIds: []
      });

      expect(staffResult.notified).toBeGreaterThan(0);
    });

    test('should notify customer about successful purchase', async () => {
      const packageId = 'pkg-123';
      const customerId = 'customer-456';

      pool.query.mockResolvedValueOnce({
        rows: [{ booking_updates: true }]
      });

      const studentResult = await dispatchNotification({
        userId: customerId,
        type: 'booking_student',
        title: 'Package Purchased',
        message: 'Your "Beginner Kite Package" has been purchased successfully.',
        data: {
          packageId,
          amount: 299.99,
          currency: 'EUR',
          cta: { label: 'View Package', href: '/dashboard/packages' }
        },
        idempotencyKey: `package-purchase:${packageId}:student:${customerId}`,
        checkPreference: true
      });

      expect(studentResult.sent).toBe(true);
      expect(studentResult.id).toBeDefined();
    });

    test('should respect customer preference for purchase confirmations', async () => {
      const packageId = 'pkg-123';
      const customerId = 'customer-456';

      pool.query.mockResolvedValueOnce({
        rows: [{ booking_updates: false }]
      });

      const result = await dispatchNotification({
        userId: customerId,
        type: 'booking_student',
        title: 'Package Purchased',
        message: 'Your package was purchased',
        checkPreference: true
      });

      expect(result.sent).toBe(false);
    });
  });

  describe('Accommodation Booking Flow', () => {
    test('should notify staff when accommodation is booked', async () => {
      const bookingId = 'acc-booking-789';
      const guestId = 'guest-123';

      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 'admin-001', name: 'Alice Admin' }
        ]
      });

      const staffResult = await dispatchToStaff({
        type: 'accommodation_booking',
        title: 'New Accommodation Booking',
        message: 'New booking for Ocean View Suite from 2026-04-10 to 2026-04-15',
        data: {
          bookingId,
          guestId,
          checkInDate: '2026-04-10',
          checkOutDate: '2026-04-15',
          totalPrice: 499.99,
          cta: { label: 'View Booking', href: `/admin/accommodation/bookings/${bookingId}` }
        },
        idempotencyPrefix: `accommodation-booking:${bookingId}`,
        excludeUserIds: []
      });

      expect(staffResult.notified).toBeGreaterThan(0);
    });

    test('should notify guest about booking confirmation', async () => {
      const bookingId = 'acc-booking-789';
      const guestId = 'guest-123';

      pool.query.mockResolvedValueOnce({
        rows: [{ booking_updates: true }]
      });

      const guestResult = await dispatchNotification({
        userId: guestId,
        type: 'accommodation_booking',
        title: 'Accommodation Booking Confirmed',
        message: 'Your booking for Ocean View Suite has been confirmed for 5 night(s).',
        data: {
          bookingId,
          checkInDate: '2026-04-10',
          checkOutDate: '2026-04-15',
          totalPrice: 499.99,
          nights: 5,
          cta: { label: 'View Booking', href: `/bookings/accommodation/${bookingId}` }
        },
        idempotencyKey: `accommodation-booking:${bookingId}:guest:${guestId}`,
        checkPreference: true
      });

      expect(guestResult.sent).toBe(true);
    });

    test('should respect guest preference for booking confirmations', async () => {
      const bookingId = 'acc-booking-789';
      const guestId = 'guest-123';

      // accommodation_booking maps to new_booking_alerts in PREFERENCE_MAP
      pool.query.mockResolvedValueOnce({
        rows: [{ new_booking_alerts: false }]
      });

      const result = await dispatchNotification({
        userId: guestId,
        type: 'accommodation_booking',
        title: 'Accommodation Booking Confirmed',
        message: 'Your booking is confirmed',
        checkPreference: true
      });

      expect(result.sent).toBe(false);
    });

    test('should handle both wallet and credit card payment flows', async () => {
      const bookingId1 = 'acc-wallet-payment';
      const bookingId2 = 'acc-card-payment';
      const guestId = 'guest-123';

      // Wallet payment
      pool.query.mockResolvedValueOnce({
        rows: [{ booking_updates: true }]
      });

      const walletResult = await dispatchNotification({
        userId: guestId,
        type: 'accommodation_booking',
        title: 'Booking Confirmed',
        message: 'Payment processed from your wallet',
        data: {
          bookingId: bookingId1,
          paymentMethod: 'wallet',
          paymentStatus: 'completed'
        },
        checkPreference: true
      });

      expect(walletResult.sent).toBe(true);

      // Credit card payment
      jest.clearAllMocks();
      pool.query.mockResolvedValueOnce({
        rows: [{ booking_updates: true }]
      });

      const creditResult = await dispatchNotification({
        userId: guestId,
        type: 'accommodation_booking',
        title: 'Booking Confirmed',
        message: 'Your booking is pending payment confirmation',
        data: {
          bookingId: bookingId2,
          paymentMethod: 'credit_card',
          paymentStatus: 'pending_payment'
        },
        checkPreference: true
      });

      expect(creditResult.sent).toBe(true);
    });
  });

  describe('Cross-Notification Consistency', () => {
    test('should use consistent data structure across notification types', async () => {
      const packageData = {
        packageId: 'pkg-123',
        amount: 299.99,
        currency: 'EUR',
        cta: { label: 'View', href: '/packages' }
      };

      const accommodationData = {
        bookingId: 'acc-123',
        totalPrice: 499.99,
        currency: 'EUR',
        cta: { label: 'View', href: '/accommodations' }
      };

      pool.query.mockResolvedValue({
        rows: [{ booking_updates: true }]
      });

      const pkg = await dispatchNotification({
        userId: 'user-1',
        type: 'package_purchase',
        title: 'Package',
        message: 'Msg',
        data: packageData,
        checkPreference: true
      });

      jest.clearAllMocks();
      pool.query.mockResolvedValue({
        rows: [{ booking_updates: true }]
      });

      const acc = await dispatchNotification({
        userId: 'user-1',
        type: 'accommodation_booking',
        title: 'Accommodation',
        message: 'Msg',
        data: accommodationData,
        checkPreference: true
      });

      expect(pkg.sent).toBe(true);
      expect(acc.sent).toBe(true);
    });
  });

  describe('Error Resilience', () => {
    test('should not crash entire booking if notification fails', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB connection lost'));

      const result = await dispatchNotification({
        userId: 'user-123',
        type: 'booking_student',
        title: 'Booking',
        message: 'Your booking',
        checkPreference: true
      });

      // Should handle gracefully (not throw)
    });

    test('should handle missing notification settings row', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await dispatchNotification({
        userId: 'user-no-settings',
        type: 'booking_student',
        title: 'Booking',
        message: 'Your booking',
        checkPreference: true
      });

      // Should default to sending (opt-out model)
      expect(result.sent).toBe(true);
    });

    test('should handle concurrent notifications to same user', async () => {
      pool.query.mockResolvedValue({
        rows: [{ booking_updates: true }]
      });

      const results = await Promise.all([
        dispatchNotification({
          userId: 'user-123',
          type: 'booking_student',
          title: 'Booking 1',
          message: 'Msg 1',
          idempotencyKey: 'booking:1:user-123',
          checkPreference: true
        }),
        dispatchNotification({
          userId: 'user-123',
          type: 'package_purchase',
          title: 'Package 1',
          message: 'Msg 2',
          idempotencyKey: 'package:1:user-123',
          checkPreference: true
        })
      ]);

      expect(results.every(r => r.sent === true)).toBe(true);
    });
  });
});
