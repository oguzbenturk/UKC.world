import { jest, describe, test, expect, beforeAll } from '@jest/globals';
/**
 * Commission logic tests
 * - Precedence: booking custom > service-specific > default
 * - Package lesson split: per-lesson amount derived from package purchase_price and used duration
 */

let BookingUpdateCascadeService;
beforeAll(async () => {
  // Register ESM mocks before importing the SUT
  await jest.unstable_mockModule('../db.js', () => ({
    pool: { connect: jest.fn(async () => ({ query: jest.fn(), release: jest.fn() })) },
  }));
  await jest.unstable_mockModule('../services/revenueSnapshotService.js', () => ({
    writeLessonSnapshot: jest.fn(() => ({ skipped: true })),
  }));

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../services/bookingUpdateCascadeService.js');
    BookingUpdateCascadeService = mod.default;
  });
});

// Helper: create a mock pg client with programmable responses
function createMockClient(sequence = []) {
  let call = 0;
  return {
    async query(sql, params) {
      // Allow both exact SQL matching or per-call sequence
      const next = sequence[call] || sequence[sequence.length - 1] || { rows: [] };
      call += 1;
      if (typeof next === 'function') return next(sql, params);
      return next;
    },
    release() {},
  };
}

describe('BookingUpdateCascadeService.computeInstructorEarnings', () => {
  test('percentage commission computes correctly', () => {
    const amt = BookingUpdateCascadeService.computeInstructorEarnings('percentage', 25, 100, 2);
    expect(amt).toBeCloseTo(25);
  });

  test('fixed_per_lesson commission computes correctly', () => {
    const amt = BookingUpdateCascadeService.computeInstructorEarnings('fixed_per_lesson', 30, 100, 2);
    expect(amt).toBeCloseTo(30);
  });

  test('fixed_per_hour commission computes correctly', () => {
    const amt = BookingUpdateCascadeService.computeInstructorEarnings('fixed_per_hour', 20, 100, 1.5);
    expect(amt).toBeCloseTo(30);
  });
});

describe('BookingUpdateCascadeService.getCommissionRate precedence', () => {
  test('booking custom overrides service and default', async () => {
    const mockClient = createMockClient([
      { rows: [{ commission_type: 'percentage', commission_value: 70 }] }, // booking_custom_commissions
    ]);

    const booking = { id: 'b1', instructor_user_id: 'i1', service_id: 's1' };
    const { commissionType, commissionValue } = await BookingUpdateCascadeService.getCommissionRate(mockClient, booking);
    expect(commissionType).toBe('percentage');
    expect(commissionValue).toBe(70);
  });

  test('service commission used when no booking custom', async () => {
    const mockClient = createMockClient([
      { rows: [] }, // booking_custom_commissions
      { rows: [{ commission_type: 'fixed_per_hour', commission_value: 18 }] }, // instructor_service_commissions
    ]);

    const booking = { id: 'b2', instructor_user_id: 'i2', service_id: 's2' };
    const { commissionType, commissionValue } = await BookingUpdateCascadeService.getCommissionRate(mockClient, booking);
    expect(commissionType).toBe('fixed_per_hour');
    expect(commissionValue).toBe(18);
  });

  test('default commission used when no custom or service', async () => {
    const mockClient = createMockClient([
      { rows: [] }, // booking_custom_commissions
      { rows: [] }, // instructor_service_commissions
      { rows: [{ commission_type: 'percentage', commission_value: 55 }] }, // instructor_default_commissions
    ]);

    const booking = { id: 'b3', instructor_user_id: 'i3', service_id: 's3' };
    const { commissionType, commissionValue } = await BookingUpdateCascadeService.getCommissionRate(mockClient, booking);
    expect(commissionType).toBe('percentage');
    expect(commissionValue).toBe(55);
  });
});

describe('BookingUpdateCascadeService.computeLessonAmount for packages', () => {
  test('non-package booking uses final_amount/amount', async () => {
    const client = createMockClient([]);
    const booking = { payment_status: 'paid', final_amount: 120 };
    const amt = await BookingUpdateCascadeService.computeLessonAmount(client, booking);
    expect(amt).toBeCloseTo(120);
  });

  test('package booking derives per-lesson amount by duration split', async () => {
    // purchase_price covers total_hours; per-lesson based on (purchase_price / (total_hours / duration))
    const client = createMockClient([
      { rows: [{ purchase_price: 600, total_hours: 10 }] },
    ]);
    const booking = {
      payment_status: 'package',
      customer_package_id: 'pkg1',
      duration: 2, // hours used by this lesson
      final_amount: 200, // irrelevant for packages; derive from package price
    };
    const amt = await BookingUpdateCascadeService.computeLessonAmount(client, booking);
    // total_hours / duration = 10/2 = 5 lessons-equivalent. 600 / 5 = 120
    expect(amt).toBeCloseTo(120);
  });

  test('package booking falls back to base when bad data', async () => {
    const client = createMockClient([{ rows: [] }]);
    const booking = {
      payment_status: 'package',
      customer_package_id: 'pkg2',
      duration: 2,
      final_amount: 80,
      amount: 80,
    };
    const amt = await BookingUpdateCascadeService.computeLessonAmount(client, booking);
    expect(amt).toBeCloseTo(80);
  });
});
