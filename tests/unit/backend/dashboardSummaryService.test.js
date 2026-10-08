import { jest, describe, test, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';

// Unit tests for backend/services/dashboardSummaryService.js with a mocked pool.
// Mock responses are routed by SQL text (not call order), so adding a query to
// the service does not shift every fixture.

let getDashboardSummary;
let pool;
let getFinanceTotals;

const ZERO_TOTALS = {
  totalRevenue: 0, lessonRevenue: 0, rentalRevenue: 0, accommodationRevenue: 0,
  membershipRevenue: 0, shopRevenue: 0, refunds: 0, instructorCommission: 0,
  managerCommission: 0, net: 0, transactions: 0,
};

// Which query a SQL string is. Order matters: most specific first.
function classify(sql) {
  if (sql.includes('FROM manager_commissions')) return 'managerComm';
  if (sql.includes('now_local')) return 'bookingsNow';
  if (sql.includes('FROM bookings') && sql.includes('completed_hours')) return 'bookings';
  if (sql.includes('jsonb_array_elements_text')) return 'rentalBreakdown';
  if (sql.includes('FROM rentals') && sql.includes('paid_revenue')) return 'rentals';
  if (sql.includes('FROM rentals')) return 'rentalsNow';
  if (sql.includes('FROM services') && sql.includes('categories')) return 'services';
  if (sql.includes('FROM equipment')) return 'equipment';
  if (sql.includes('FROM users u')) return 'customers';
  if (sql.includes('GROUP BY LOWER(s.category)')) return 'categories';
  if (sql.includes('accommodation_bookings')) return 'accommodation';
  if (sql.includes('member_purchases')) return 'membership';
  if (sql.includes('user_tags')) return 'shopCustomers';
  if (sql.includes('commission_rate')) return 'instructorComm';
  return 'other';
}

const DEFAULT_ROWS = {
  bookings: [{}], bookingsNow: [{}], rentals: [{}], rentalsNow: [{}], services: [{}],
  equipment: [{}], customers: [{}], categories: [], rentalBreakdown: [], accommodation: [],
  membership: [], shopCustomers: [{ total: 0 }], instructorComm: [], managerComm: [{ total: 0 }], other: [{}],
};

function mockQueries(overrides = {}) {
  const rows = { ...DEFAULT_ROWS, ...overrides };
  pool.query.mockImplementation((sql) => Promise.resolve({ rows: rows[classify(String(sql))] }));
}

const callsOf = (kind) => pool.query.mock.calls.filter(([sql]) => classify(String(sql)) === kind);

beforeAll(async () => {
  await jest.unstable_mockModule('../../../backend/db.js', () => ({
    pool: { query: jest.fn().mockResolvedValue({ rows: [] }) },
  }));
  await jest.unstable_mockModule('../../../backend/services/cacheService.js', () => ({
    cacheService: { get: jest.fn(async () => null), set: jest.fn(async () => {}), del: jest.fn(async () => {}) },
  }));
  await jest.unstable_mockModule('../../../backend/services/financeTotalsService.js', () => ({
    getFinanceTotals: jest.fn(async () => ({ ...ZERO_TOTALS })),
    activeFinanceTxnFilter: () => 'TRUE',
  }));

  ({ pool } = await import('../../../backend/db.js'));
  ({ getFinanceTotals } = await import('../../../backend/services/financeTotalsService.js'));
  ({ getDashboardSummary } = await import('../../../backend/services/dashboardSummaryService.js'));
});

beforeEach(() => {
  mockQueries();
  getFinanceTotals.mockResolvedValue({ ...ZERO_TOTALS });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('dashboardSummaryService.getDashboardSummary', () => {
  test('returns an empty summary when no data is available', async () => {
    const result = await getDashboardSummary();

    for (const key of ['lessons', 'rentals', 'revenue', 'services', 'equipment', 'customers']) {
      expect(result).toHaveProperty(key);
    }
    expect(result.lessons.total).toBe(0);
    expect(result.rentals.total).toBe(0);
    expect(result.revenue.transactions).toBe(0);
    expect(result.revenue.net).toBe(0);
  });

  test('passes the date range to the range-bound queries', async () => {
    await getDashboardSummary({ startDate: '2026-01-01', endDate: '2026-03-31' });

    const [, bookingParams] = callsOf('bookings')[0];
    expect(bookingParams).toEqual(['2026-01-01', '2026-03-31']);
    expect(getFinanceTotals).toHaveBeenCalledWith({ startDate: '2026-01-01', endDate: '2026-03-31' });
  });

  describe('revenue (audit #1 / #8)', () => {
    test('comes from the shared finance totals, not the legacy transactions table', async () => {
      getFinanceTotals.mockResolvedValue({
        ...ZERO_TOTALS,
        totalRevenue: 119779.71, lessonRevenue: 78555.14, rentalRevenue: 7957.5,
        refunds: 2440, instructorCommission: 27813.3, managerCommission: 8309.98,
        net: 81216.43, transactions: 1248,
      });

      const result = await getDashboardSummary({ startDate: '2026-01-01', endDate: '2026-10-08' });

      expect(result.revenue.income).toBe(119779.71);
      expect(result.revenue.net).toBe(81216.43);
      expect(result.revenue.transactions).toBe(1248);
      expect(result.revenue.refunds).toBe(2440);
      // money out = refunds + instructor + manager commission, negative
      expect(result.revenue.expenses).toBe(-38563.28);
      expect(result.revenue.serviceRevenue).toBe(78555.14);
      expect(result.revenue.rentalRevenue).toBe(7957.5);
      expect(result.revenue.instructorPayouts).toBe(27813.3);

      const legacy = pool.query.mock.calls.filter(([sql]) => /\bFROM\s+transactions\b/i.test(String(sql)));
      expect(legacy).toHaveLength(0);
    });

    test('net is never "0 minus manager commission" when the period has no revenue', async () => {
      mockQueries({ managerComm: [{ total: 8309.98 }] });

      const result = await getDashboardSummary({ startDate: '2026-01-01', endDate: '2026-10-08' });

      expect(result.revenue.net).toBe(0);
      expect(result.revenue.managerCommission).toBe(8309.98);
    });
  });

  describe('lessons', () => {
    test('aggregates the range metrics', async () => {
      mockQueries({
        bookings: [{ total: 50, completed: 40, cancelled: 3, total_hours: 100, completed_hours: 85, total_revenue: 5000 }],
      });

      const result = await getDashboardSummary();

      expect(result.lessons.total).toBe(50);
      expect(result.lessons.completed).toBe(40);
      expect(result.lessons.totalHours).toBe(100);
      expect(result.lessons.totalRevenue).toBe(5000);
      expect(result.lessons.completionRate).toBeCloseTo(0.8);
      expect(result.lessons.averageDuration).toBeCloseTo(2);
    });

    test('upcoming / active are measured from now, without the range end (audit #7)', async () => {
      mockQueries({ bookingsNow: [{ upcoming: 117, active: 2 }] });

      const result = await getDashboardSummary({ startDate: '2026-01-01', endDate: '2026-10-08' });

      expect(result.lessons.upcoming).toBe(117);
      expect(result.lessons.active).toBe(2);
      const [[sql, params]] = callsOf('bookingsNow');
      expect(params).toEqual([process.env.BUSINESS_TIMEZONE || 'Europe/Istanbul']);
      expect(sql).toContain('deleted_at IS NULL');
      expect(sql).not.toMatch(/'cancelled'/);
      // the range query no longer computes upcoming
      expect(callsOf('bookings')[0][0]).not.toContain('AS upcoming');
    });
  });

  describe('rentals (audit #6)', () => {
    test('range totals come from the range query, active / upcoming from "now"', async () => {
      mockQueries({
        rentals: [{ total: 20, completed: 7, total_revenue: 2000, paid_revenue: 1800 }],
        rentalsNow: [{ active: 5, upcoming: 25 }],
      });

      const result = await getDashboardSummary({ startDate: '2026-01-01', endDate: '2026-10-08' });

      expect(result.rentals.total).toBe(20);
      expect(result.rentals.completed).toBe(7);
      expect(result.rentals.totalRevenue).toBe(2000);
      expect(result.rentals.paidRevenue).toBe(1800);
      expect(result.rentals.averageRevenue).toBeCloseTo(100);
      expect(result.rentals.active).toBe(5);
      expect(result.rentals.upcoming).toBe(25);

      const [[nowSql, nowParams]] = callsOf('rentalsNow');
      expect(nowParams).toBeUndefined(); // no range bounds
      expect(nowSql).toContain("'upcoming'");
      expect(nowSql).toContain('start_date > NOW()');
      expect(nowSql).toContain('start_date <= NOW() AND end_date >= NOW()');
    });

    test('the service breakdown counts active + upcoming rentals with no range limit', async () => {
      mockQueries({ rentalBreakdown: [{ service_name: '4H - SLS Kitesurf Rental', count: 3 }] });

      const result = await getDashboardSummary({ startDate: '2026-01-01', endDate: '2026-10-08' });

      expect(result.rentals.serviceBreakdown).toEqual([{ serviceName: '4H - SLS Kitesurf Rental', count: 3 }]);
      const [[sql, params]] = callsOf('rentalBreakdown');
      expect(params).toBeUndefined();
      expect(sql).toContain("'upcoming'");
    });
  });

  describe('membership (audit #13)', () => {
    test('active members ignore the purchase date; new-in-range is separate', async () => {
      mockQueries({
        membership: [
          { offering_name: 'Season', active_count: 10, total_purchased: 2 },
          { offering_name: 'Storage', active_count: 4, total_purchased: 0 },
        ],
      });

      const result = await getDashboardSummary({ startDate: '2026-10-08', endDate: '2026-10-08' });

      expect(result.membership.totalActive).toBe(14);
      expect(result.membership.newInRange).toBe(2);
      const [[sql, params]] = callsOf('membership');
      // the range only appears inside the total_purchased / HAVING filters
      expect(sql).not.toMatch(/FROM member_purchases mp\s+LEFT JOIN member_offerings mo ON mo.id = mp.offering_id\s+WHERE/);
      expect(params).toHaveLength(2);
    });
  });

  test('aggregates customer metrics by role', async () => {
    mockQueries({
      customers: [{ total_customers: 100, students: 70, outsiders: 15, trusted_customers: 10, instructors: 20, staff: 5, new_this_month: 8 }],
    });

    const result = await getDashboardSummary();

    expect(result.customers.totalCustomers).toBe(100);
    expect(result.customers.students).toBe(70);
    expect(result.customers.instructors).toBe(20);
    expect(result.customers.staff).toBe(5);
  });

  test('includes accommodation data', async () => {
    mockQueries({
      accommodation: [
        { unit_name: 'Unit A', booking_count: 10, total_nights: 30 },
        { unit_name: 'Unit B', booking_count: 8, total_nights: 24 },
      ],
    });

    const result = await getDashboardSummary();

    expect(result.accommodation.totalBookings).toBe(18);
    expect(result.accommodation.totalNights).toBe(54);
  });

  test('returns custom / lifetime timeframe', async () => {
    const custom = await getDashboardSummary({ startDate: '2026-02-01', endDate: '2026-02-28' });
    expect(custom.timeframe).toEqual({ range: 'custom', start: '2026-02-01', end: '2026-02-28' });

    const lifetime = await getDashboardSummary();
    expect(lifetime.timeframe).toEqual({ range: 'lifetime', start: null, end: null });
  });

  test('includes a generatedAt timestamp', async () => {
    const before = Date.now();
    const result = await getDashboardSummary();
    const generated = new Date(result.generatedAt).getTime();
    expect(generated).toBeGreaterThanOrEqual(before);
    expect(generated).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
