import { jest, describe, test, expect, beforeAll, afterEach } from '@jest/globals';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let getDashboardSummary;

beforeAll(async () => {
  // Mock the database before importing the service
  await jest.unstable_mockModule('../../../backend/db.js', () => ({
    pool: {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    },
  }));

  await jest.unstable_mockModule('../../../backend/services/cacheService.js', () => ({
    cacheService: {
      get: jest.fn(async () => null),
      set: jest.fn(async () => {}),
      del: jest.fn(async () => {}),
    },
  }));

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../backend/services/dashboardSummaryService.js');
    getDashboardSummary = mod.getDashboardSummary;
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('dashboardSummaryService.getDashboardSummary', () => {
  test('returns empty summary when no data available', async () => {
    const { pool } = await import('../../../backend/db.js');

    // Mock all queries to return empty results
    pool.query.mockResolvedValue({ rows: [{}] });

    const result = await getDashboardSummary();

    expect(result).toHaveProperty('lessons');
    expect(result).toHaveProperty('rentals');
    expect(result).toHaveProperty('revenue');
    expect(result).toHaveProperty('services');
    expect(result).toHaveProperty('equipment');
    expect(result).toHaveProperty('customers');
    expect(result.lessons.total).toBe(0);
    expect(result.rentals.total).toBe(0);
    expect(result.revenue.transactions).toBe(0);
  });

  test('filters by start and end date when provided', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValue({ rows: [{}] });

    const startDate = '2026-01-01';
    const endDate = '2026-03-31';

    await getDashboardSummary({ startDate, endDate });

    // Verify that queries were called (at least 12 times for all dashboard queries)
    expect(pool.query).toHaveBeenCalled();

    // Check that the queries include date parameters
    const calls = pool.query.mock.calls;
    const hasDateParams = calls.some(call =>
      call[1] && call[1].length > 0 &&
      (call[1].includes(startDate) || call[1].includes(endDate))
    );
    expect(hasDateParams).toBe(true);
  });

  test('aggregates booking metrics correctly', async () => {
    const { pool } = await import('../../../backend/db.js');

    const bookingData = {
      total: 50,
      completed: 40,
      upcoming: 5,
      active: 2,
      cancelled: 3,
      total_hours: 100,
      completed_hours: 85,
      total_revenue: 5000,
    };

    // Mock responses for all queries
    const responses = [
      { rows: [bookingData] }, // bookings
      { rows: [{}] }, // rentals
      { rows: [{}] }, // revenue
      { rows: [{}] }, // services
      { rows: [{}] }, // equipment
      { rows: [{}] }, // customers
      { rows: [] }, // booking categories
      { rows: [] }, // rental breakdown
      { rows: [] }, // accommodation
      { rows: [] }, // membership
      { rows: [{ total: 0 }] }, // shop customers
      { rows: [] }, // instructor commissions
    ];

    let callIndex = 0;
    pool.query.mockImplementation(() => {
      const response = responses[callIndex % responses.length];
      callIndex++;
      return Promise.resolve(response);
    });

    const result = await getDashboardSummary();

    expect(result.lessons.total).toBe(50);
    expect(result.lessons.completed).toBe(40);
    expect(result.lessons.upcoming).toBe(5);
    expect(result.lessons.totalHours).toBe(100);
    expect(result.lessons.totalRevenue).toBe(5000);
  });

  test('calculates lesson completion rate', async () => {
    const { pool } = await import('../../../backend/db.js');

    const bookingData = {
      total: 100,
      completed: 80,
      upcoming: 10,
      active: 5,
      cancelled: 5,
      total_hours: 200,
      completed_hours: 160,
      total_revenue: 10000,
    };

    const responses = [
      { rows: [bookingData] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [{ total: 0 }] },
      { rows: [] },
    ];

    let callIndex = 0;
    pool.query.mockImplementation(() => {
      const response = responses[callIndex % responses.length];
      callIndex++;
      return Promise.resolve(response);
    });

    const result = await getDashboardSummary();

    expect(result.lessons.completionRate).toBeCloseTo(0.8);
    expect(result.lessons.averageDuration).toBeCloseTo(2);
  });

  test('returns timeframe information correctly', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValue({ rows: [{}] });

    const result = await getDashboardSummary({
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });

    expect(result.timeframe.range).toBe('custom');
    expect(result.timeframe.start).toBe('2026-02-01');
    expect(result.timeframe.end).toBe('2026-02-28');
  });

  test('returns lifetime timeframe when no dates provided', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValue({ rows: [{}] });

    const result = await getDashboardSummary();

    expect(result.timeframe.range).toBe('lifetime');
    expect(result.timeframe.start).toBeNull();
    expect(result.timeframe.end).toBeNull();
  });

  test('aggregates customer metrics by role', async () => {
    const { pool } = await import('../../../backend/db.js');

    const customerData = {
      total_customers: 100,
      students: 70,
      outsiders: 15,
      trusted_customers: 10,
      instructors: 20,
      staff: 5,
      new_this_month: 8,
    };

    const responses = [
      { rows: [{}] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [customerData] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [{ total: 0 }] },
      { rows: [] },
    ];

    let callIndex = 0;
    pool.query.mockImplementation(() => {
      const response = responses[callIndex % responses.length];
      callIndex++;
      return Promise.resolve(response);
    });

    const result = await getDashboardSummary();

    expect(result.customers.totalCustomers).toBe(100);
    expect(result.customers.students).toBe(70);
    expect(result.customers.instructors).toBe(20);
    expect(result.customers.staff).toBe(5);
  });

  test('includes generatedAt timestamp', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValue({ rows: [{}] });

    const before = new Date();
    const result = await getDashboardSummary();
    const after = new Date();

    expect(result.generatedAt).toBeDefined();
    const generatedTime = new Date(result.generatedAt);
    expect(generatedTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(generatedTime.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });

  test('handles rental metrics', async () => {
    const { pool } = await import('../../../backend/db.js');

    const rentalData = {
      total: 20,
      active: 5,
      upcoming: 8,
      completed: 7,
      total_revenue: 2000,
      paid_revenue: 1800,
    };

    const responses = [
      { rows: [{}] },
      { rows: [rentalData] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [{ total: 0 }] },
      { rows: [] },
    ];

    let callIndex = 0;
    pool.query.mockImplementation(() => {
      const response = responses[callIndex % responses.length];
      callIndex++;
      return Promise.resolve(response);
    });

    const result = await getDashboardSummary();

    expect(result.rentals.total).toBe(20);
    expect(result.rentals.active).toBe(5);
    expect(result.rentals.upcoming).toBe(8);
    expect(result.rentals.totalRevenue).toBe(2000);
    expect(result.rentals.paidRevenue).toBe(1800);
  });

  test('calculates rental average revenue', async () => {
    const { pool } = await import('../../../backend/db.js');

    const rentalData = {
      total: 10,
      active: 2,
      upcoming: 3,
      completed: 5,
      total_revenue: 1000,
      paid_revenue: 900,
    };

    const responses = [
      { rows: [{}] },
      { rows: [rentalData] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [{ total: 0 }] },
      { rows: [] },
    ];

    let callIndex = 0;
    pool.query.mockImplementation(() => {
      const response = responses[callIndex % responses.length];
      callIndex++;
      return Promise.resolve(response);
    });

    const result = await getDashboardSummary();

    expect(result.rentals.averageRevenue).toBeCloseTo(100);
  });

  test('aggregates revenue by category', async () => {
    const { pool } = await import('../../../backend/db.js');

    const revenueData = {
      total_transactions: 150,
      income: 8000,
      expenses: -500,
      net: 7500,
      service_revenue: 5000,
      rental_revenue: 2000,
      instructor_payouts: 1500,
    };

    const responses = [
      { rows: [{}] },
      { rows: [{}] },
      { rows: [revenueData] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [{ total: 0 }] },
      { rows: [] },
    ];

    let callIndex = 0;
    pool.query.mockImplementation(() => {
      const response = responses[callIndex % responses.length];
      callIndex++;
      return Promise.resolve(response);
    });

    const result = await getDashboardSummary();

    expect(result.revenue.income).toBe(8000);
    expect(result.revenue.expenses).toBe(-500);
    expect(result.revenue.net).toBe(7500);
    expect(result.revenue.serviceRevenue).toBe(5000);
  });

  test('includes accommodation and membership data', async () => {
    const { pool } = await import('../../../backend/db.js');

    const accommodationData = [
      { unit_name: 'Unit A', booking_count: 10, total_nights: 30 },
      { unit_name: 'Unit B', booking_count: 8, total_nights: 24 },
    ];

    const membershipData = [
      { offering_name: 'Premium', active_count: 15, total_purchased: 20 },
    ];

    const responses = [
      { rows: [{}] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [{}] },
      { rows: [] },
      { rows: [] },
      { rows: accommodationData },
      { rows: membershipData },
      { rows: [{ total: 0 }] },
      { rows: [] },
    ];

    let callIndex = 0;
    pool.query.mockImplementation(() => {
      const response = responses[callIndex % responses.length];
      callIndex++;
      return Promise.resolve(response);
    });

    const result = await getDashboardSummary();

    expect(result.accommodation.totalBookings).toBe(18);
    expect(result.accommodation.totalNights).toBe(54);
    expect(result.membership.totalActive).toBe(15);
  });
});
