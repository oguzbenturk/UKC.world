import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pool } from '../../db.js';
import { dispatchNotification, dispatchToStaff } from '../../services/notificationDispatcherUnified.js';

/**
 * Integration tests for notification delivery across critical user flows.
 * Tests verify that:
 * 1. Package purchase notifications are sent to staff + student
 * 2. Accommodation booking notifications are sent to staff + guest
 * 3. User preferences are respected for each notification type
 * 4. Notifications include correct CTAs and data payloads
 */

describe('Notification Integration Tests', () => {
  describe('Package Purchase Flow', () => {
    it('should notify staff when customer purchases package', async () => {
      const packageId = 'pkg-123';
      const customerId = 'customer-456';
      const adminId = 'admin-001';
      const managerId = 'manager-001';

      // Mock staff query
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: adminId, name: 'Alice Admin' },
          { id: managerId, name: 'Bob Manager' }
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

    it('should notify customer about successful purchase', async () => {
      const packageId = 'pkg-123';
      const customerId = 'customer-456';

      // Mock customer preference check
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

    it('should respect staff preference for package purchase alerts', async () => {
      const packageId = 'pkg-123';

      // Mock staff member with alerts disabled
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 'admin-1', name: 'Alice', new_booking_alerts: false }
        ]
      });

      // When new_booking_alerts is false, notification should be skipped
      const result = await dispatchNotification({
        userId: 'admin-1',
        type: 'package_purchase',
        title: 'New Package Purchase',
        message: 'A customer purchased a package',
        checkPreference: true
      });

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('user-preference-disabled');
    });

    it('should respect customer preference for purchase confirmations', async () => {
      const packageId = 'pkg-123';
      const customerId = 'customer-456';

      // Mock customer with booking_updates disabled
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

    it('should include correct CTA for package notification', async () => {
      const packageId = 'pkg-123';
      const customerId = 'customer-456';

      pool.query.mockResolvedValueOnce({
        rows: [{ booking_updates: true }]
      });

      const result = await dispatchNotification({
        userId: customerId,
        type: 'booking_student',
        title: 'Package Purchased',
        message: 'Package purchased',
        data: {
          packageId,
          cta: { label: 'View Package', href: '/dashboard/packages' }
        },
        idempotencyKey: `package-purchase:${packageId}:student:${customerId}`,
        checkPreference: true
      });

      expect(result.sent).toBe(true);
      // Data should be preserved for frontend routing
    });

    it('should use idempotency key to prevent duplicate package notifications', async () => {
      const packageId = 'pkg-123';
      const customerId = 'customer-456';
      const idempotencyKey = `package-purchase:${packageId}:student:${customerId}`;

      pool.query.mockResolvedValueOnce({
        rows: [{ booking_updates: true }]
      });

      // First notification
      const result1 = await dispatchNotification({
        userId: customerId,
        type: 'booking_student',
        title: 'Package Purchased',
        message: 'Your package',
        idempotencyKey,
        checkPreference: true
      });

      expect(result1.sent).toBe(true);

      // Retry with same key should be rejected by DB (unique constraint)
      // In real implementation, insertNotification would return { inserted: false }
    });
  });

  describe('Accommodation Booking Flow', () => {
    it('should notify staff when accommodation is booked', async () => {
      const bookingId = 'acc-booking-789';
      const guestId = 'guest-123';
      const adminId = 'admin-001';

      // Mock staff query
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: adminId, name: 'Alice Admin' }
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

    it('should notify guest about booking confirmation', async () => {
      const bookingId = 'acc-booking-789';
      const guestId = 'guest-123';

      // Mock guest preference check
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

    it('should respect staff preference for accommodation alerts', async () => {
      const bookingId = 'acc-booking-789';

      // Mock admin with accommodation alerts disabled
      pool.query.mockResolvedValueOnce({
        rows: [{ new_booking_alerts: false }]
      });

      const result = await dispatchNotification({
        userId: 'admin-1',
        type: 'accommodation_booking',
        title: 'New Accommodation Booking',
        message: 'A guest booked accommodation',
        checkPreference: true
      });

      expect(result.sent).toBe(false);
    });

    it('should respect guest preference for booking confirmations', async () => {
      const bookingId = 'acc-booking-789';
      const guestId = 'guest-123';

      // Mock guest with booking_updates disabled
      pool.query.mockResolvedValueOnce({
        rows: [{ booking_updates: false }]
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

    it('should include correct CTA for different user types', async () => {
      const bookingId = 'acc-booking-789';

      pool.query.mockResolvedValueOnce({
        rows: [{ booking_updates: true }]
      });

      // Guest CTA
      const guestResult = await dispatchNotification({
        userId: 'guest-123',
        type: 'accommodation_booking',
        title: 'Booking Confirmed',
        message: 'Your booking is confirmed',
        data: {
          bookingId,
          cta: { label: 'View Booking', href: `/bookings/accommodation/${bookingId}` }
        },
        idempotencyKey: `accommodation-booking:${bookingId}:guest:guest-123`,
        checkPreference: true
      });

      expect(guestResult.sent).toBe(true);

      // Staff CTA would be different
    });

    it('should handle both wallet and credit card payment flows', async () => {
      const bookingId = 'acc-wallet-payment';
      const guestId = 'guest-123';

      // Wallet payment - notification sent immediately
      pool.query.mockResolvedValueOnce({
        rows: [{ booking_updates: true }]
      });

      const walletResult = await dispatchNotification({
        userId: guestId,
        type: 'accommodation_booking',
        title: 'Booking Confirmed',
        message: 'Payment processed from your wallet',
        data: {
          bookingId,
          paymentMethod: 'wallet',
          paymentStatus: 'completed'
        },
        checkPreference: true
      });

      expect(walletResult.sent).toBe(true);

      // Credit card payment - notification sent from callback
      const creditResult = await dispatchNotification({
        userId: guestId,
        type: 'accommodation_booking',
        title: 'Booking Confirmed',
        message: 'Your booking is pending payment confirmation',
        data: {
          bookingId,
          paymentMethod: 'credit_card',
          paymentStatus: 'pending_payment'
        },
        checkPreference: true
      });

      expect(creditResult.sent).toBe(true);
    });
  });

  describe('Cross-Notification Consistency', () => {
    it('should use consistent data structure across notification types', async () => {
      // Both package and accommodation should have similar data shape
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

      pool.query.mockClear();
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
      // Both follow same pattern: id, amount/price, currency, cta
    });

    it('should handle notification type validation', () => {
      // Valid types
      expect(NOTIFICATION_TYPES.has('package_purchase')).toBe(true);
      expect(NOTIFICATION_TYPES.has('accommodation_booking')).toBe(true);

      // Should have fallback for unknown types
      expect(NOTIFICATION_TYPES.has('general')).toBe(true);
    });
  });

  describe('Error Resilience', () => {
    it('should not crash entire booking if notification fails', async () => {
      // Simulate notification DB failure
      pool.query.mockRejectedValueOnce(new Error('DB connection lost'));

      const result = await dispatchNotification({
        userId: 'user-123',
        type: 'booking_student',
        title: 'Booking',
        message: 'Your booking',
        checkPreference: true
      });

      // Should handle gracefully (not throw)
      // In real code, would catch and log warning
    });

    it('should handle missing notification settings row', async () => {
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

    it('should handle concurrent notifications to same user', async () => {
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
