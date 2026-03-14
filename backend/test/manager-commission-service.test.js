import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

/**
 * Manager Commission Service tests
 * Tests for: salary types, commission rate calculation per category, payroll aggregation
 */

let managerCommissionService;
let mockPool;

beforeAll(async () => {
  mockPool = {
    query: jest.fn(async () => ({ rows: [] })),
    connect: jest.fn(async () => ({
      query: jest.fn(async () => ({ rows: [{ id: 'mc1' }] })),
      release: jest.fn()
    }))
  };

  await jest.unstable_mockModule('../db.js', () => ({
    pool: mockPool,
    default: mockPool
  }));

  await jest.unstable_mockModule('../middlewares/errorHandler.js', () => ({
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }
  }));

  await jest.unstable_mockModule('../services/currencyService.js', () => ({
    default: {
      getDefaultCurrency: jest.fn(() => 'EUR'),
      convert: jest.fn((amount) => amount)
    }
  }));

  const mod = await import('../services/managerCommissionService.js');
  managerCommissionService = mod;
});

beforeEach(() => {
  mockPool.query.mockReset();
  mockPool.connect.mockReset();
  mockPool.connect.mockResolvedValue({
    query: jest.fn(async () => ({ rows: [{ id: 'mc1' }] })),
    release: jest.fn()
  });
});

// ==========================================
// getCommissionRate — internal/private, tested via integration
// ==========================================

describe('upsertManagerCommissionSettings', () => {
  test('saves all salary type fields for commission mode', async () => {
    const fakeRow = {
      id: 's1',
      manager_user_id: 'mgr1',
      commission_type: 'per_category',
      default_rate: '15',
      booking_rate: '12',
      rental_rate: '10',
      accommodation_rate: '8',
      package_rate: '5',
      shop_rate: '7',
      membership_rate: '6',
      salary_type: 'commission',
      fixed_salary_amount: '0',
      per_lesson_amount: '0',
      is_active: true
    };

    mockPool.query.mockResolvedValueOnce({ rows: [] }); // check existing
    mockPool.query.mockResolvedValueOnce({ rows: [fakeRow] }); // insert

    const result = await managerCommissionService.upsertManagerCommissionSettings('mgr1', {
      salaryType: 'commission',
      commissionType: 'per_category',
      defaultRate: 15,
      bookingRate: 12,
      rentalRate: 10,
      accommodationRate: 8,
      packageRate: 5,
      shopRate: 7,
      membershipRate: 6
    }, 'admin1');

    expect(result).toBeDefined();
    expect(result.salary_type).toBe('commission');
    expect(result.shop_rate).toBe('7');
    expect(result.membership_rate).toBe('6');
  });

  test('saves monthly salary type', async () => {
    const fakeRow = {
      id: 's2',
      manager_user_id: 'mgr2',
      commission_type: 'flat',
      default_rate: '0',
      salary_type: 'monthly_salary',
      fixed_salary_amount: '3000',
      per_lesson_amount: '0',
      is_active: true
    };

    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 's2' }] }); // existing
    mockPool.query.mockResolvedValueOnce({ rows: [fakeRow] }); // update

    const result = await managerCommissionService.upsertManagerCommissionSettings('mgr2', {
      salaryType: 'monthly_salary',
      fixedSalaryAmount: 3000
    }, 'admin1');

    expect(result.salary_type).toBe('monthly_salary');
    expect(result.fixed_salary_amount).toBe('3000');
  });

  test('saves fixed per lesson type', async () => {
    const fakeRow = {
      id: 's3',
      manager_user_id: 'mgr3',
      commission_type: 'flat',
      default_rate: '0',
      salary_type: 'fixed_per_lesson',
      fixed_salary_amount: '0',
      per_lesson_amount: '25',
      is_active: true
    };

    mockPool.query.mockResolvedValueOnce({ rows: [] }); // no existing
    mockPool.query.mockResolvedValueOnce({ rows: [fakeRow] }); // insert

    const result = await managerCommissionService.upsertManagerCommissionSettings('mgr3', {
      salaryType: 'fixed_per_lesson',
      perLessonAmount: 25
    }, 'admin1');

    expect(result.salary_type).toBe('fixed_per_lesson');
    expect(result.per_lesson_amount).toBe('25');
  });
});

describe('getAllManagersWithCommissionSettings', () => {
  test('returns managers with new salary fields', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: 'mgr1',
        name: 'John Doe',
        email: 'john@test.com',
        profile_image_url: null,
        settings_id: 's1',
        commission_type: 'per_category',
        default_rate: '15',
        booking_rate: '12',
        rental_rate: '10',
        accommodation_rate: '8',
        package_rate: '5',
        shop_rate: '7',
        membership_rate: '6',
        salary_type: 'commission',
        fixed_salary_amount: '0',
        per_lesson_amount: '0',
        settings_active: true,
        pending_commission: '250',
        paid_commission: '1500'
      }]
    });

    const result = await managerCommissionService.getAllManagersWithCommissionSettings();

    expect(result).toHaveLength(1);
    expect(result[0].settings.salaryType).toBe('commission');
    expect(result[0].settings.shopRate).toBe(7);
    expect(result[0].settings.membershipRate).toBe(6);
    expect(result[0].settings.fixedSalaryAmount).toBe(0);
    expect(result[0].settings.perLessonAmount).toBe(0);
  });

  test('defaults salary type to commission when null', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: 'mgr2',
        name: 'Jane Smith',
        email: 'jane@test.com',
        profile_image_url: null,
        settings_id: 's2',
        salary_type: null,
        commission_type: 'flat',
        default_rate: '10',
        settings_active: true,
        pending_commission: '0',
        paid_commission: '0'
      }]
    });

    const result = await managerCommissionService.getAllManagersWithCommissionSettings();
    expect(result[0].settings.salaryType).toBe('commission');
  });
});

describe('getManagerPayrollEarnings', () => {
  test('returns monthly and seasonal breakdown for commission type', async () => {
    // Mock settings query
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        salary_type: 'commission',
        commission_type: 'flat',
        default_rate: '10',
        fixed_salary_amount: '0',
        per_lesson_amount: '0'
      }]
    });

    // Mock commission aggregation query
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          period_month: '2024-01',
          booking_count: '5',
          rental_count: '2',
          accommodation_count: '0',
          package_count: '0',
          shop_count: '1',
          membership_count: '0',
          booking_earnings: '500',
          rental_earnings: '200',
          accommodation_earnings: '0',
          package_earnings: '0',
          shop_earnings: '50',
          membership_earnings: '0',
          total_commission: '750',
          paid_amount: '500',
          pending_amount: '250'
        },
        {
          period_month: '2024-07',
          booking_count: '10',
          rental_count: '5',
          accommodation_count: '1',
          package_count: '0',
          shop_count: '2',
          membership_count: '1',
          booking_earnings: '1000',
          rental_earnings: '500',
          accommodation_earnings: '100',
          package_earnings: '0',
          shop_earnings: '100',
          membership_earnings: '50',
          total_commission: '1750',
          paid_amount: '1750',
          pending_amount: '0'
        }
      ]
    });

    const result = await managerCommissionService.getManagerPayrollEarnings('mgr1', { year: 2024 });

    expect(result.year).toBe(2024);
    expect(result.salaryType).toBe('commission');
    expect(result.months).toHaveLength(12);

    // January
    const jan = result.months[0];
    expect(jan.monthName).toBe('January');
    expect(jan.bookings.count).toBe(5);
    expect(jan.bookings.earnings).toBe(500);
    expect(jan.grossAmount).toBe(750);

    // July
    const jul = result.months[6];
    expect(jul.grossAmount).toBe(1750);

    // Empty month
    const feb = result.months[1];
    expect(feb.grossAmount).toBe(0);

    // Seasons
    expect(result.seasons).toHaveLength(4);
    expect(result.seasons[0].name).toBe('Winter');
    expect(result.seasons[0].grossAmount).toBe(750); // only Jan has data in Q1

    expect(result.seasons[2].name).toBe('Summer');
    expect(result.seasons[2].grossAmount).toBe(1750); // Jul data

    // Totals
    expect(result.totals.gross).toBe(2500);
    expect(result.totals.paid).toBe(2250);
    expect(result.totals.pending).toBe(250);
  });

  test('calculates monthly salary correctly', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        salary_type: 'monthly_salary',
        commission_type: 'flat',
        default_rate: '0',
        fixed_salary_amount: '2000',
        per_lesson_amount: '0'
      }]
    });

    mockPool.query.mockResolvedValueOnce({ rows: [] }); // no commissions

    const result = await managerCommissionService.getManagerPayrollEarnings('mgr2', { year: 2024 });

    expect(result.salaryType).toBe('monthly_salary');
    // Each month should have €2000 gross
    expect(result.months[0].grossAmount).toBe(2000);
    expect(result.months[5].grossAmount).toBe(2000);
    expect(result.totals.gross).toBe(24000); // 12 * 2000
  });

  test('calculates per-lesson salary correctly', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        salary_type: 'fixed_per_lesson',
        commission_type: 'flat',
        default_rate: '0',
        fixed_salary_amount: '0',
        per_lesson_amount: '30'
      }]
    });

    mockPool.query.mockResolvedValueOnce({
      rows: [{
        period_month: '2024-03',
        booking_count: '8',
        rental_count: '0',
        accommodation_count: '0',
        package_count: '0',
        shop_count: '0',
        membership_count: '0',
        booking_earnings: '0',
        rental_earnings: '0',
        accommodation_earnings: '0',
        package_earnings: '0',
        shop_earnings: '0',
        membership_earnings: '0',
        total_commission: '0',
        paid_amount: '0',
        pending_amount: '0'
      }]
    });

    const result = await managerCommissionService.getManagerPayrollEarnings('mgr3', { year: 2024 });

    expect(result.salaryType).toBe('fixed_per_lesson');
    // March: 8 lessons * €30 = €240
    const mar = result.months[2];
    expect(mar.bookings.count).toBe(8);
    expect(mar.grossAmount).toBe(240);
    // Other months: 0 lessons * €30 = €0
    expect(result.months[0].grossAmount).toBe(0);
  });
});
