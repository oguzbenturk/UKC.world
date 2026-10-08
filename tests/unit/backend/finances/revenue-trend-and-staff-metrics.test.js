// Regression: manager dashboard audit #3 and #4 (2026-10-08).
//
// #3 GET /finances/revenue-analytics (cash basis) summed ABS() of a handful of wallet
//    "payment" rows — on the demo the year's trend added up to €4.143,75 while
//    /summary reported €119.779,71. The trend is now built from the same revenue legs
//    as /summary, so its points must add up to summary.total_revenue.
// #4 GET /finances/operational-metrics "instructorMetrics" recomputed commission inline
//    (no instructor_category_rates, listed managers with 0). It now reads the
//    instructor_earnings ledger, the same source as instructor payroll.
//
// Runs against the LOCAL dev DB (backend/.env → localhost:5432/plannivo_dev) in an
// isolated far-past window (Feb–Mar 2004). Cleans up after itself.

import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';

import { pool } from '../../../../backend/db.js';

const WINDOW_START = '2004-02-01';
const WINDOW_END = '2004-03-31';

const created = { users: [], bookings: [], rentals: [] };
const handlers = {};
let testables;

function lastHandler(router, path) {
  const layer = router.stack.find((l) => l.route?.path === path && l.route.methods.get);
  if (!layer) throw new Error(`${path} handler not found`);
  const stack = layer.route.stack.map((s) => s.handle);
  return stack[stack.length - 1]; // skip auth / authorize / cache middleware
}

function call(handler, query) {
  return new Promise((resolve, reject) => {
    const res = {
      json: (body) => resolve(body),
      status: (code) => ({ json: (body) => reject(new Error(`HTTP ${code}: ${JSON.stringify(body)}`)) }),
    };
    Promise.resolve(handler({ query, params: {}, user: { id: null, role: 'admin' } }, res)).catch(reject);
  });
}

async function createUser(roleName, label) {
  const id = randomUUID();
  const { rows } = await pool.query(`SELECT id FROM roles WHERE name = $1 LIMIT 1`, [roleName]);
  await pool.query(
    `INSERT INTO users (id, name, first_name, last_name, email, password_hash, role_id, created_at, updated_at)
     VALUES ($1, $2, $2, 'Trend', $3, 'test-hash', $4, NOW(), NOW())`,
    [id, label, `trend-${id.slice(0, 8)}@test.com`, rows[0]?.id || null]
  );
  created.users.push(id);
  return id;
}

async function createBooking({ date, status, finalAmount, duration, instructor, student, deleted = false }) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO bookings (id, date, start_hour, duration, status, final_amount, amount,
                           instructor_user_id, student_user_id, deleted_at)
     VALUES ($1, $2, 10, $3, $4, $5, $5, $6, $7, $8)`,
    [id, date, duration, status, finalAmount, instructor, student, deleted ? new Date() : null]
  );
  created.bookings.push(id);
  return id;
}

async function seedTx({ userId, type, amount, at, description = 'trend regression seed' }) {
  await pool.query(
    `INSERT INTO wallet_transactions
       (user_id, transaction_type, status, direction, currency, amount, available_delta,
        description, metadata, transaction_date, created_at, updated_at)
     VALUES ($1, $2, 'completed', 'debit', 'EUR', $3, $3, $4, '{}'::jsonb, $5, $5, $5)`,
    [userId, type, amount, description, at]
  );
}

const sumTrend = (trends) => trends.reduce((s, t) => s.plus(t.revenue || 0), new Decimal(0)).toNumber();

let ids = {};

beforeAll(async () => {
  const mod = await import('../../../../backend/routes/finances.js');
  handlers.summary = lastHandler(mod.default, '/summary');
  handlers.analytics = lastHandler(mod.default, '/revenue-analytics');
  handlers.ops = lastHandler(mod.default, '/operational-metrics');
  testables = mod.__testables;

  const instructor = await createUser('instructor', 'Trendy Teacher');
  const otherInstructor = await createUser('instructor', 'Second Teacher');
  const manager = await createUser('manager', 'Idle Manager');
  const student = await createUser('student', 'Trend Student');

  const b1 = await createBooking({ date: '2004-02-10', status: 'completed', finalAmount: 120, duration: 2, instructor, student });
  const b2 = await createBooking({ date: '2004-03-05', status: 'completed', finalAmount: 80, duration: 1, instructor, student });
  await createBooking({ date: '2004-03-06', status: 'cancelled', finalAmount: 60, duration: 1, instructor, student });
  const deleted = await createBooking({ date: '2004-03-07', status: 'completed', finalAmount: 999, duration: 1, instructor, student, deleted: true });
  const b3 = await createBooking({ date: '2004-03-12', status: 'completed', finalAmount: 100, duration: 2, instructor: otherInstructor, student });

  // Ledger amounts deliberately differ from any inline formula of final_amount × rate.
  await pool.query(
    `INSERT INTO instructor_earnings
       (instructor_id, booking_id, base_rate, commission_rate, total_earnings, lesson_date, lesson_duration, lesson_amount)
     VALUES ($1, $2, 60, 27.78, 33.33, '2004-02-10', 2, 120),
            ($1, $3, 80, 26.39, 21.11, '2004-03-05', 1, 80),
            ($1, $4, 999, 50, 499.50, '2004-03-07', 1, 999),
            ($5, $6, 50, 70, 70.00, '2004-03-12', 2, 100)`,
    [instructor, b1, b2, deleted, otherInstructor, b3]
  );

  // Rental (rentals table), shop sale and accommodation charge (wallet ledger).
  const rental = randomUUID();
  await pool.query(
    `INSERT INTO rentals (id, user_id, start_date, end_date, status, total_price, payment_status)
     VALUES ($1, $2, '2004-03-07T09:00:00Z', '2004-03-08T09:00:00Z', 'completed', 45, 'paid')`,
    [rental, student]
  );
  created.rentals.push(rental);
  await seedTx({ userId: student, type: 'payment', amount: '-30.00', at: '2004-02-20T10:00:00Z', description: 'Shop order #T1' });
  await seedTx({ userId: student, type: 'accommodation_charge', amount: '-70.00', at: '2004-03-10T10:00:00Z' });

  ids = { instructor, otherInstructor, manager };
});

afterAll(async () => {
  if (created.users.length) {
    await pool.query('DELETE FROM wallet_transactions WHERE user_id = ANY($1::uuid[])', [created.users]);
    await pool.query('DELETE FROM instructor_earnings WHERE instructor_id = ANY($1::uuid[])', [created.users]);
  }
  await pool.query(
    `DELETE FROM service_revenue_ledger WHERE entity_id = ANY($1::uuid[])`,
    [[...created.bookings, ...created.rentals]]
  ).catch(() => {});
  if (created.rentals.length) await pool.query('DELETE FROM rentals WHERE id = ANY($1::uuid[])', [created.rentals]);
  if (created.bookings.length) await pool.query('DELETE FROM bookings WHERE id = ANY($1::uuid[])', [created.bookings]);
  if (created.users.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [created.users]);
  await pool.end();
});

describe('revenue trend reconciles with /summary (#3)', () => {
  test.each(['month', 'week', 'day'])('trend points (groupBy=%s) add up to summary.total_revenue', async (groupBy) => {
    const summary = await call(handlers.summary, { startDate: WINDOW_START, endDate: WINDOW_END });
    const analytics = await call(handlers.analytics, {
      startDate: WINDOW_START, endDate: WINDOW_END, groupBy, mode: 'cash',
    });
    expect(Number(summary.revenue.total_revenue)).toBeGreaterThan(145); // lessons + 45 + 30 + 70
    expect(sumTrend(analytics.trends)).toBeCloseTo(Number(summary.revenue.total_revenue), 2);
    analytics.trends.forEach((t) => expect(typeof t.revenue).toBe('number'));
  });

  test('month buckets: February holds the shop sale + Feb lesson, March the rest', async () => {
    const analytics = await call(handlers.analytics, {
      startDate: WINDOW_START, endDate: WINDOW_END, groupBy: 'month', mode: 'cash',
    });
    expect(analytics.trends.map((t) => t.period)).toEqual(['2004-02', '2004-03']);
  });

  test.each(['lessons', 'rentals', 'shop', 'accommodation', 'membership'])(
    'serviceType=%s trend matches the filtered summary', async (serviceType) => {
      const summary = await call(handlers.summary, { startDate: WINDOW_START, endDate: WINDOW_END, serviceType });
      const analytics = await call(handlers.analytics, {
        startDate: WINDOW_START, endDate: WINDOW_END, groupBy: 'month', mode: 'cash', serviceType,
      });
      expect(sumTrend(analytics.trends)).toBeCloseTo(Number(summary.revenue.total_revenue), 2);
    },
  );

  test('rental, shop and accommodation legs carry their exact amounts', async () => {
    const legs = {};
    for (const serviceType of ['rentals', 'shop', 'accommodation']) {
      const a = await call(handlers.analytics, {
        startDate: WINDOW_START, endDate: WINDOW_END, groupBy: 'month', mode: 'cash', serviceType,
      });
      legs[serviceType] = sumTrend(a.trends);
    }
    expect(legs).toEqual({ rentals: 45, shop: 30, accommodation: 70 });
  });

  test('week/day labels match Postgres TO_CHAR', async () => {
    const days = ['2004-02-01', '2004-03-12', '2026-01-01', '2026-12-31', '2027-01-01', '2021-01-03'];
    const { rows } = await pool.query(
      `SELECT d::text AS day, TO_CHAR(d, 'YYYY-"W"IW') AS week, TO_CHAR(d, 'YYYY-MM') AS month
         FROM unnest($1::date[]) AS d`,
      [days]
    );
    rows.forEach((r) => {
      expect(testables.revenuePeriodKey(r.day, 'week')).toBe(r.week);
      expect(testables.revenuePeriodKey(r.day, 'month')).toBe(r.month);
      expect(testables.revenuePeriodKey(r.day, 'day')).toBe(r.day);
    });
  });
});

describe('Top staff commission comes from the instructor_earnings ledger (#4)', () => {
  test('per-instructor total = ledger sum of completed, non-deleted bookings; managers without lessons are not listed', async () => {
    const ops = await call(handlers.ops, { startDate: WINDOW_START, endDate: WINDOW_END });
    const byId = Object.fromEntries(ops.instructorMetrics.map((r) => [r.id, r]));

    const main = byId[ids.instructor];
    expect(main).toBeDefined();
    expect(Number(main.total_revenue)).toBeCloseTo(54.44, 2); // 33.33 + 21.11 (deleted booking excluded)
    expect(Number(main.completed_lessons)).toBe(2);
    expect(Number(main.total_lessons)).toBe(3); // cancelled counts as a booked lesson, deleted does not
    expect(Number(main.average_lesson_value)).toBeCloseTo(27.22, 2);

    expect(Number(byId[ids.otherInstructor].total_revenue)).toBeCloseTo(70, 2);
    expect(byId[ids.manager]).toBeUndefined();

    // Sorted by commission, highest first.
    const totals = ops.instructorMetrics.map((r) => Number(r.total_revenue));
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
  });
});
