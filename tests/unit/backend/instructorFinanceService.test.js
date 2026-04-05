import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

let pool;
let getInstructorEarningsData;
let getInstructorPayrollHistory;
let getInstructorPaymentsSummary;
let getAllInstructorBalances;
let deriveLessonAmount;
let deriveTotalEarnings;
let toNumber;

beforeAll(async () => {
  // Setup ESM mocks before importing the service
  await jest.unstable_mockModule('../../../backend/db.js', () => ({
    pool: { query: jest.fn() },
  }));

  await jest.unstable_mockModule('../../../backend/utils/instructorEarnings.js', () => ({
    deriveLessonAmount: jest.fn(),
    deriveTotalEarnings: jest.fn(),
    toNumber: jest.fn(),
  }));

  // Import modules after mocks are set up
  const dbModule = await import('../../../backend/db.js');
  pool = dbModule.pool;

  const earningsModule = await import('../../../backend/utils/instructorEarnings.js');
  deriveLessonAmount = earningsModule.deriveLessonAmount;
  deriveTotalEarnings = earningsModule.deriveTotalEarnings;
  toNumber = earningsModule.toNumber;

  const serviceModule = await import('../../../backend/services/instructorFinanceService.js');
  getInstructorEarningsData = serviceModule.getInstructorEarningsData;
  getInstructorPayrollHistory = serviceModule.getInstructorPayrollHistory;
  getInstructorPaymentsSummary = serviceModule.getInstructorPaymentsSummary;
  getAllInstructorBalances = serviceModule.getAllInstructorBalances;
});

describe('InstructorFinanceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations
    toNumber.mockImplementation(val => Number(val) || 0);
    deriveLessonAmount.mockReturnValue(100);
    deriveTotalEarnings.mockReturnValue(100);
  });

  describe('getInstructorEarningsData', () => {
    test('returns earnings for completed bookings', async () => {
      const mockBookings = [
        {
          booking_id: 1,
          lesson_date: '2026-04-04',
          start_hour: 9,
          lesson_duration: 2,
          base_amount: 100,
          final_amount: 100,
          payment_status: 'cash',
          booking_status: 'completed',
          student_name: 'John Doe',
          service_name: 'Kite Lesson',
          service_price: 100,
          service_duration: 2,
          group_size: 1,
          commission_rate: 20,
          commission_type: 'percentage',
          currency: 'EUR',
        },
      ];

      pool.query.mockResolvedValue({ rows: mockBookings });
      deriveLessonAmount.mockReturnValue(100);
      deriveTotalEarnings.mockReturnValue(20);

      const result = await getInstructorEarningsData(1);

      expect(result.earnings).toBeDefined();
      expect(Array.isArray(result.earnings)).toBe(true);
      expect(result.totals).toBeDefined();
      expect(result.totals.totalEarnings).toBe(20);
      expect(result.totals.totalLessons).toBe(1);
    });

    test('returns empty earnings for no completed bookings', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await getInstructorEarningsData(1);

      expect(result.earnings).toEqual([]);
      expect(result.totals.totalEarnings).toBe(0);
      expect(result.totals.totalLessons).toBe(0);
      expect(result.totals.totalHours).toBe(0);
    });

    test('filters bookings by date range', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await getInstructorEarningsData(1, {
        startDate: '2026-04-01',
        endDate: '2026-04-30',
      });

      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[1]).toContain('2026-04-01');
      expect(callArgs[1]).toContain('2026-04-30');
    });

    test('includes start date only when provided', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await getInstructorEarningsData(1, { startDate: '2026-04-01' });

      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[1]).toContain('2026-04-01');
    });

    test('includes end date only when provided', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await getInstructorEarningsData(1, { endDate: '2026-04-30' });

      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[1]).toContain('2026-04-30');
    });

    test('calculates total earnings correctly', async () => {
      const mockBookings = [
        {
          booking_id: 1,
          lesson_duration: 2,
          final_amount: 100,
          payment_status: 'cash',
          booking_status: 'completed',
          service_duration: 2,
          group_size: 1,
          commission_type: 'percentage',
        },
        {
          booking_id: 2,
          lesson_duration: 1.5,
          final_amount: 75,
          payment_status: 'cash',
          booking_status: 'completed',
          service_duration: 1.5,
          group_size: 1,
          commission_type: 'percentage',
        },
      ];

      pool.query.mockResolvedValue({ rows: mockBookings });
      deriveLessonAmount
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(75);
      deriveTotalEarnings
        .mockReturnValueOnce(20)
        .mockReturnValueOnce(15);

      const result = await getInstructorEarningsData(1);

      expect(result.totals.totalEarnings).toBe(35);
      expect(result.totals.totalLessons).toBe(2);
      expect(result.totals.totalHours).toBe(3.5);
    });

    test('handles package payment status', async () => {
      const mockBookings = [
        {
          booking_id: 1,
          lesson_duration: 2,
          base_amount: 0,
          final_amount: 100,
          payment_status: 'package',
          booking_status: 'completed',
          package_price: 500,
          package_total_hours: 10,
          package_remaining_hours: 8,
          package_used_hours: 2,
          package_sessions_count: 5,
          service_duration: 2,
          service_price: 100,
          group_size: 1,
          commission_type: 'percentage',
        },
      ];

      pool.query.mockResolvedValue({ rows: mockBookings });
      deriveLessonAmount.mockReturnValue(100);
      deriveTotalEarnings.mockReturnValue(20);

      const result = await getInstructorEarningsData(1);

      expect(result.earnings).toBeDefined();
      expect(deriveLessonAmount).toHaveBeenCalled();
    });

    test('handles group bookings with multiple participants', async () => {
      const mockBookings = [
        {
          booking_id: 1,
          lesson_duration: 2,
          base_amount: 100,
          final_amount: 200,
          payment_status: 'cash',
          booking_status: 'completed',
          student_name: 'John, Jane, Bob',
          group_size: 3,
          service_duration: 2,
          service_price: 100,
          commission_type: 'percentage',
        },
      ];

      pool.query.mockResolvedValue({ rows: mockBookings });
      deriveLessonAmount.mockReturnValue(100);
      deriveTotalEarnings.mockReturnValue(30);

      const result = await getInstructorEarningsData(1);

      expect(result.earnings).toBeDefined();
      expect(result.earnings[0].group_size).toBe(3);
    });

    test('excludes deleted bookings', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await getInstructorEarningsData(1);

      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[0]).toContain('b.deleted_at IS NULL');
    });

    test('only includes completed bookings', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await getInstructorEarningsData(1);

      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[0]).toContain("b.status = 'completed'");
    });

    test('rounds totals to 2 decimal places', async () => {
      const mockBookings = [
        {
          booking_id: 1,
          lesson_duration: 1.5555,
          final_amount: 99.999,
          payment_status: 'cash',
          booking_status: 'completed',
          service_duration: 1.5555,
          group_size: 1,
          commission_type: 'percentage',
        },
      ];

      pool.query.mockResolvedValue({ rows: mockBookings });
      deriveLessonAmount.mockReturnValue(99.999);
      deriveTotalEarnings.mockReturnValue(19.999);

      const result = await getInstructorEarningsData(1);

      expect(result.totals.totalEarnings).toBe(20.00);
      expect(result.totals.totalHours).toBe(1.56);
    });

    test('throws error on database failure', async () => {
      pool.query.mockRejectedValue(new Error('DB connection failed'));

      await expect(getInstructorEarningsData(1))
        .rejects.toThrow('DB connection failed');
    });
  });

  describe('getInstructorPayrollHistory', () => {
    test('returns payment history for instructor', async () => {
      const mockHistory = [
        {
          id: 1,
          amount: 500,
          type: 'payment',
          description: 'April payments',
          payment_method: 'bank_transfer',
          payment_date: '2026-04-01',
        },
        {
          id: 2,
          amount: 250,
          type: 'payment',
          description: 'May payments',
          payment_method: 'bank_transfer',
          payment_date: '2026-05-01',
        },
      ];

      pool.query.mockResolvedValue({ rows: mockHistory });

      const result = await getInstructorPayrollHistory(1);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual(mockHistory);
    });

    test('returns empty array when no history', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await getInstructorPayrollHistory(1);

      expect(result).toEqual([]);
    });

    test('respects limit option', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await getInstructorPayrollHistory(1, { limit: 10 });

      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[1]).toContain(10);
      expect(callArgs[0]).toContain('LIMIT');
    });

    test('handles no limit option', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await getInstructorPayrollHistory(1);

      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[1]).toEqual([1]);
    });

    test('filters out cancelled payments', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await getInstructorPayrollHistory(1);

      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[0]).toContain("status != 'cancelled'");
    });

    test('includes both payment and deduction types', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await getInstructorPayrollHistory(1);

      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[0]).toContain("'payment', 'deduction'");
    });

    test('orders by date descending', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await getInstructorPayrollHistory(1);

      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[0]).toContain('ORDER BY created_at DESC');
    });
  });

  describe('getInstructorPaymentsSummary', () => {
    test('returns payment summary', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [{ net_payments: 5000, total_paid: 5000 }],
        })
        .mockResolvedValueOnce({
          rows: [{ amount: 500, created_at: '2026-04-01' }],
        });

      toNumber
        .mockReturnValueOnce(5000)
        .mockReturnValueOnce(5000)
        .mockReturnValueOnce(500);

      const result = await getInstructorPaymentsSummary(1);

      expect(result.netPayments).toBe(5000);
      expect(result.totalPaid).toBe(5000);
      expect(result.lastPayment).toBeDefined();
    });

    test('returns null last payment when none exists', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [{ net_payments: 0, total_paid: 0 }],
        })
        .mockResolvedValueOnce({
          rows: [],
        });

      toNumber.mockReturnValue(0);

      const result = await getInstructorPaymentsSummary(1);

      expect(result.lastPayment).toBeNull();
    });

    test('handles missing summary data', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      toNumber.mockReturnValue(0);

      const result = await getInstructorPaymentsSummary(1);

      expect(result.netPayments).toBe(0);
      expect(result.totalPaid).toBe(0);
    });

    test('filters by entity type', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ net_payments: 0, total_paid: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      toNumber.mockReturnValue(0);

      await getInstructorPaymentsSummary(1);

      const summaryCall = pool.query.mock.calls[0];
      expect(summaryCall[0]).toContain("entity_type = 'instructor_payment'");
    });

    test('excludes cancelled transactions', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ net_payments: 0, total_paid: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      toNumber.mockReturnValue(0);

      await getInstructorPaymentsSummary(1);

      const summaryCall = pool.query.mock.calls[0];
      expect(summaryCall[0]).toContain("status != 'cancelled'");
    });
  });

  describe('getAllInstructorBalances', () => {
    test('returns balance map for all instructors', async () => {
      const mockBookings = [
        {
          instructor_user_id: 1,
          booking_id: 'b1',
          lesson_duration: 2,
          base_amount: 100,
          payment_status: 'cash',
          group_size: 1,
          commission_rate: 20,
          commission_type: 'percentage',
        },
      ];

      const mockPayments = [
        {
          instructor_id: 1,
          total_paid: 1000,
        },
      ];

      pool.query
        .mockResolvedValueOnce({ rows: mockBookings })
        .mockResolvedValueOnce({ rows: mockPayments })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      toNumber.mockImplementation(val => Number(val) || 0);
      deriveLessonAmount.mockReturnValue(100);
      deriveTotalEarnings.mockReturnValue(20);

      const result = await getAllInstructorBalances();

      expect(typeof result).toBe('object');
      expect(result[1]).toBeDefined();
      expect(result[1].totalEarned).toBe(20);
      expect(result[1].totalPaid).toBe(1000);
      expect(result[1].balance).toBe(-980);
    });

    test('handles instructors with no payments', async () => {
      const mockBookings = [
        {
          instructor_user_id: 1,
          booking_id: 'b1',
          lesson_duration: 2,
          base_amount: 100,
          payment_status: 'cash',
          group_size: 1,
          commission_rate: 20,
          commission_type: 'percentage',
        },
      ];

      pool.query
        .mockResolvedValueOnce({ rows: mockBookings })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      toNumber.mockImplementation(val => Number(val) || 0);
      deriveLessonAmount.mockReturnValue(100);
      deriveTotalEarnings.mockReturnValue(20);

      const result = await getAllInstructorBalances();

      expect(result[1].totalPaid).toBe(0);
      expect(result[1].balance).toBe(20);
    });

    test('handles instructors with no completed bookings', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await getAllInstructorBalances();

      expect(typeof result).toBe('object');
      expect(Object.keys(result).length).toBe(0);
    });

    test('includes manager commissions', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ manager_user_id: 1, total_earned: 500 }] })
        .mockResolvedValueOnce({ rows: [] });

      // toNumber should return the actual value for manager earnings
      toNumber.mockImplementation(val => {
        if (val === 500) return 500;
        return Number(val) || 0;
      });

      const result = await getAllInstructorBalances();

      expect(result[1]).toBeDefined();
      expect(result[1].manager).not.toBeNull();
      expect(result[1].manager.totalEarned).toBe(500);
    });

    test('merges instructor and manager earnings', async () => {
      const mockBookings = [
        {
          instructor_user_id: 1,
          booking_id: 'b1',
          lesson_duration: 2,
          base_amount: 100,
          payment_status: 'cash',
          group_size: 1,
          commission_rate: 20,
          commission_type: 'percentage',
        },
      ];

      pool.query
        .mockResolvedValueOnce({ rows: mockBookings })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ manager_user_id: 1, total_earned: 500 }] })
        .mockResolvedValueOnce({ rows: [] });

      toNumber.mockImplementation(val => Number(val) || 0);
      deriveLessonAmount.mockReturnValue(100);
      deriveTotalEarnings.mockReturnValue(20);

      const result = await getAllInstructorBalances();

      expect(result[1].totalEarned).toBe(520); // 20 + 500
      expect(result[1].instructor.totalEarned).toBe(20);
      expect(result[1].manager.totalEarned).toBe(500);
    });

    test('calculates balance correctly', async () => {
      const mockBookings = [
        {
          instructor_user_id: 1,
          booking_id: 'b1',
          lesson_duration: 2,
          base_amount: 100,
          payment_status: 'cash',
          group_size: 1,
          commission_rate: 20,
          commission_type: 'percentage',
        },
      ];

      const mockPayments = [{ instructor_id: 1, total_paid: 500 }];

      pool.query
        .mockResolvedValueOnce({ rows: mockBookings })
        .mockResolvedValueOnce({ rows: mockPayments })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      toNumber.mockImplementation(val => Number(val) || 0);
      deriveLessonAmount.mockReturnValue(100);
      deriveTotalEarnings.mockReturnValue(200);

      const result = await getAllInstructorBalances();

      expect(result[1].balance).toBe(-300); // 200 - 500
    });

    test('excludes deleted users', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await getAllInstructorBalances();

      const bookingsCall = pool.query.mock.calls[0];
      expect(bookingsCall[0]).toContain('u.deleted_at IS NULL');
    });

    test('handles group bookings correctly', async () => {
      const mockBookings = [
        {
          instructor_user_id: 1,
          booking_id: 'b1',
          lesson_duration: 2,
          base_amount: 100,
          payment_status: 'package',
          group_size: 3,
          commission_rate: 20,
          commission_type: 'percentage',
        },
      ];

      pool.query
        .mockResolvedValueOnce({ rows: mockBookings })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      toNumber.mockImplementation(val => Number(val) || 0);
      deriveLessonAmount.mockReturnValue(100);
      deriveTotalEarnings.mockReturnValue(60); // For group, multiplied by 3

      const result = await getAllInstructorBalances();

      expect(result[1].totalEarned).toBe(60);
    });

    test('rounds all monetary values to 2 decimals', async () => {
      const mockBookings = [
        {
          instructor_user_id: 1,
          booking_id: 'b1',
          lesson_duration: 2,
          base_amount: 100.555,
          payment_status: 'cash',
          group_size: 1,
          commission_rate: 20.999,
          commission_type: 'percentage',
        },
      ];

      const mockPayments = [{ instructor_id: 1, total_paid: 500.555 }];

      pool.query
        .mockResolvedValueOnce({ rows: mockBookings })
        .mockResolvedValueOnce({ rows: mockPayments })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      toNumber.mockImplementation(val => Number(val) || 0);
      deriveLessonAmount.mockReturnValue(100.555);
      deriveTotalEarnings.mockReturnValue(20.999);

      const result = await getAllInstructorBalances();

      expect(result[1].totalEarned).toBe(21.00);
      expect(result[1].totalPaid).toBe(500.56);
    });
  });
});
