// Manager "pending payout" / year-to-date / vs-last-month (audit 2026-10-08, findings #2 #5 #9).
//
// Integration suite against the LOCAL dev DB: a throw-away manager with
// non-lesson commission rows (shop / membership / accommodation → no booking
// needed for the live guard) and manager payouts in wallet_transactions. All
// fixtures are removed in afterAll.
import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

let app;
let pool;
let svc;
let dashboardPeriods;

const RUN = crypto.randomBytes(4).toString('hex');
let managerId;

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysFromToday = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

async function addCommission(sourceDate, amount, { status = 'pending', sourceType = 'shop' } = {}) {
  await pool.query(
    `INSERT INTO manager_commissions
       (manager_user_id, source_type, source_id, source_amount, commission_rate, commission_amount,
        period_month, status, source_date)
     VALUES ($1, $2, $3, $4, 10, $5, $6, $7, $8)`,
    [managerId, sourceType, `owed-${RUN}-${crypto.randomUUID()}`, amount * 10, amount,
      sourceDate.slice(0, 7), status, sourceDate],
  );
}

async function addPayout(amount, createdAt, type = 'payment') {
  await pool.query(
    `INSERT INTO wallet_transactions
       (user_id, transaction_type, status, direction, currency, amount, entity_type, created_at, transaction_date)
     VALUES ($1, $2, 'completed', $3, 'EUR', $4, 'manager_payment', $5, $5)`,
    [managerId, type, amount >= 0 ? 'credit' : 'debit', amount, `${createdAt}T12:00:00Z`],
  );
}

beforeAll(async () => {
  await jest.unstable_mockModule('../../../../backend/services/notificationDispatcherUnified.js', () => ({
    dispatchNotification: jest.fn(async () => ({ sent: true, id: 'mock' })),
    dispatchToStaff: jest.fn(async () => ({ notified: 0, skipped: 0 })),
  }));
  ({ pool } = await import('../../../../backend/db.js'));
  svc = await import('../../../../backend/services/managerCommissionService.js');
  ({ dashboardPeriods } = await import('../../../../backend/routes/managerCommissions.js'));
  app = (await import('../../../../backend/server.js')).default;

  const { rows: [role] } = await pool.query("SELECT id FROM roles WHERE name = 'manager'");
  const { rows: [u] } = await pool.query(
    `INSERT INTO users (name, first_name, last_name, email, password_hash, role_id)
     VALUES ($1, 'Owed', 'Manager', $2, 'x', $3) RETURNING id`,
    [`Owed Manager ${RUN}`, `owed-${RUN}@manager.test`, role.id],
  );
  managerId = u.id;

  // Earned, oldest first: 100 + 200 + 300 = 600 (+ one cancelled, + one future row)
  await addCommission(daysFromToday(-60), 100);
  await addCommission(daysFromToday(-40), 200);
  await addCommission(daysFromToday(-20), 300);
  await addCommission(daysFromToday(-10), 999, { status: 'cancelled' });
  await addCommission(daysFromToday(+30), 50, { sourceType: 'accommodation' }); // not earned yet

  // Paid 250 + deducted 20 → covers row 1 (100) and part of row 2 (200)
  await addPayout(250, daysFromToday(-30));
  await addPayout(-20, daysFromToday(-5), 'deduction');
}, 30000);

afterAll(async () => {
  try {
    await pool.query('DELETE FROM manager_commissions WHERE manager_user_id = $1', [managerId]);
    await pool.query('DELETE FROM wallet_transactions WHERE user_id = $1', [managerId]);
    await pool.query('DELETE FROM users WHERE id = $1', [managerId]);
  } catch { /* best-effort cleanup */ }
}, 30000);

describe('getManagerOwedBalance (pending payout)', () => {
  test('owed = all-time earned up to today − paid − deducted; FIFO count of uncovered rows', async () => {
    const owed = await svc.getManagerOwedBalance(managerId);
    expect(owed.earned).toBeCloseTo(600, 2); // cancelled + future rows excluded
    expect(owed.paid).toBeCloseTo(250, 2);
    expect(owed.deducted).toBeCloseTo(20, 2);
    expect(owed.amount).toBeCloseTo(330, 2);
    // 270 covers row 1 (100, running 100) and NOT row 2 (running 300) → rows 2 + 3 open
    expect(owed.count).toBe(2);
  });

  test('a future-dated row becomes owed once its date has passed', async () => {
    const owed = await svc.getManagerOwedBalance(managerId, { asOf: daysFromToday(+31) });
    expect(owed.amount).toBeCloseTo(380, 2);
    expect(owed.count).toBe(3);
  });

  test('summary for ANY window reports the same overall pending (no more €0 per month)', async () => {
    const month = daysFromToday(-20).slice(0, 7);
    const monthSummary = await svc.getManagerCommissionSummary(managerId, { periodMonth: month });
    const allTime = await svc.getManagerCommissionSummary(managerId, {});
    expect(monthSummary.pending.amount).toBeCloseTo(330, 2);
    expect(allTime.pending.amount).toBeCloseTo(330, 2);
    expect(allTime.pending.count).toBe(2);
    expect(allTime.currency).toBe('EUR');
  });

  test('paid is scoped to the window by payout date; all-time without a window', async () => {
    const allTime = await svc.getManagerCommissionSummary(managerId, {});
    expect(allTime.paid.amount).toBeCloseTo(250, 2);
    const recent = await svc.getManagerCommissionSummary(managerId, { startDate: daysFromToday(-7), endDate: daysFromToday(0) });
    expect(recent.paid.amount).toBe(0);
    expect(recent.deducted.amount).toBeCloseTo(20, 2);
  });

  test('a range ending today leaves out future-dated commissions', async () => {
    const s = await svc.getManagerCommissionSummary(managerId, { startDate: daysFromToday(-365), endDate: daysFromToday(0) });
    expect(s.totalEarned).toBeCloseTo(600, 2);
  });
});

describe('getManagerUnsettledInRange (payroll "pending" for a year)', () => {
  // settled 270 covers row1 (100) fully and 170 of row2 (200) → row2 30 + row3 300 unpaid
  test('payouts settle the oldest commissions first; ranges get their own unpaid part', async () => {
    const all = await svc.getManagerUnsettledInRange(managerId, { start: daysFromToday(-365), end: daysFromToday(365) });
    expect(all).toBeCloseTo(330, 2);
    const owed = await svc.getManagerOwedBalance(managerId);
    expect(all).toBeCloseTo(owed.amount, 2);

    const firstRowOnly = await svc.getManagerUnsettledInRange(managerId, { start: daysFromToday(-61), end: daysFromToday(-59) });
    expect(firstRowOnly).toBe(0);
    const secondRowOnly = await svc.getManagerUnsettledInRange(managerId, { start: daysFromToday(-41), end: daysFromToday(-39) });
    expect(secondRowOnly).toBeCloseTo(30, 2);
    const futureOnly = await svc.getManagerUnsettledInRange(managerId, { start: daysFromToday(1), end: daysFromToday(60) });
    expect(futureOnly).toBe(0);
  });
});

describe('dashboardPeriods (vs last month)', () => {
  test('current month compares month-to-date with the same days of last month', () => {
    const p = dashboardPeriods(new Date(2026, 9, 8, 12)); // 8 Oct 2026
    expect(p.today).toBe('2026-10-08');
    expect(p.currentPeriod).toBe('2026-10');
    expect(p.prevPeriod).toBe('2026-09');
    expect(p.compare.basis).toBe('month_to_date');
    expect(p.compare.currentRange).toEqual({ start: '2026-10-01', end: '2026-10-08' });
    expect(p.compare.previousRange).toEqual({ start: '2026-09-01', end: '2026-09-08' });
  });

  test('day is capped at the end of a shorter previous month; January wraps to December', () => {
    expect(dashboardPeriods(new Date(2026, 2, 31, 12)).compare.previousRange).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    const jan = dashboardPeriods(new Date(2027, 0, 15, 12));
    expect(jan.prevPeriod).toBe('2026-12');
    expect(jan.compare.previousRange).toEqual({ start: '2026-12-01', end: '2026-12-15' });
  });

  test('a past period compares two full months', () => {
    const p = dashboardPeriods(new Date(2026, 9, 8, 12), '2026-08');
    expect(p.compare.basis).toBe('full_month');
    expect(p.compare.previousRange).toBeNull();
    expect(p.compare.previousFullRange).toEqual({ start: '2026-07-01', end: '2026-07-31' });
  });
});

describe('GET /api/manager/commissions/dashboard', () => {
  const token = (id, role) =>
    jwt.sign({ id, email: `owed-${RUN}@manager.test`, role }, process.env.JWT_SECRET || 'plannivo-jwt-secret-key', { expiresIn: '1h' });

  test('pending payout, year to date (ends today) and month-to-date comparison', async () => {
    const res = await request(app)
      .get('/api/manager/commissions/dashboard')
      .set('Authorization', `Bearer ${token(managerId, 'manager')}`);
    expect(res.status).toBe(200);
    const { currentPeriod, yearToDate, comparison } = res.body.data;
    expect(currentPeriod.pending.amount).toBeCloseTo(330, 2);
    expect(yearToDate.pending.amount).toBeCloseTo(330, 2);
    expect(comparison.basis).toBe('month_to_date');
    expect(comparison.previousRange.end.slice(8)).toBe(
      String(Math.min(new Date().getDate(), new Date(new Date().getFullYear(), new Date().getMonth(), 0).getDate())).padStart(2, '0'),
    );
    // future accommodation row (+30 days) is never in YTD
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const { rows: [expected] } = await pool.query(
      `SELECT COALESCE(SUM(commission_amount), 0) AS s FROM manager_commissions
        WHERE manager_user_id = $1 AND status != 'cancelled' AND source_date BETWEEN $2 AND CURRENT_DATE`,
      [managerId, yearStart],
    );
    expect(yearToDate.totalEarned).toBeCloseTo(Number(expected.s), 2);
  });

  test('admin is still refused (frontend hides the card for non-managers)', async () => {
    const res = await request(app)
      .get('/api/manager/commissions/dashboard')
      .set('Authorization', `Bearer ${token(managerId, 'admin')}`);
    expect(res.status).toBe(403);
  });
});
