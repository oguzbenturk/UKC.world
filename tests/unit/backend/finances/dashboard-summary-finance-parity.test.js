// Regression (manager dashboard audit 2026-10-08, findings #1 / #8 / #13):
// /api/dashboard/summary built income / net / transactions from the legacy
// `transactions` table (no code writes it any more), so Manager Home showed
// "Net Revenue = 0 − manager commission" and "Transactions = 0". The summary now
// uses the shared finance totals and must match GET /finances/summary exactly.
//
// Runs against the LOCAL dev DB in an isolated far-past window (February 2005),
// asserting deltas over whatever the window held before. Cleans up after itself.
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { jest, afterAll, beforeAll, describe, expect, test } from '@jest/globals';

const WINDOW = { startDate: '2005-02-01', endDate: '2005-02-28' };
const RUN = randomUUID().slice(0, 8);

let pool;
let getDashboardSummary;
let summaryHandler;
const created = { users: [], offerings: [], legacyTx: [] };

function lastHandler(router, path) {
  const layer = router.stack.find((l) => l.route?.path === path && l.route.methods.get);
  if (!layer) throw new Error(`${path} handler not found`);
  const stack = layer.route.stack.map((s) => s.handle);
  return stack[stack.length - 1]; // skip auth / authorize / cache middleware
}

function callSummary(query) {
  return new Promise((resolve, reject) => {
    const res = {
      json: (body) => resolve(body),
      status: (code) => ({ json: (body) => reject(new Error(`HTTP ${code}: ${JSON.stringify(body)}`)) }),
    };
    Promise.resolve(summaryHandler({ query, params: {}, user: { id: null, role: 'admin' } }, res)).catch(reject);
  });
}

const d = (v) => new Decimal(v ?? 0);
const delta = (after, before) => d(after).minus(d(before)).toNumber();

async function createStudent() {
  const id = randomUUID();
  const { rows } = await pool.query(`SELECT id FROM roles WHERE name = 'student' LIMIT 1`);
  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role_id, created_at, updated_at)
     VALUES ($1, 'Parity Test', $2, 'test-hash', $3, NOW(), NOW())`,
    [id, `dash-parity-${RUN}-${id.slice(0, 4)}@test.com`, rows[0]?.id || null],
  );
  created.users.push(id);
  return id;
}

async function seedWallet({ userId, type, direction, amount, at }) {
  await pool.query(
    `INSERT INTO wallet_transactions
       (user_id, transaction_type, status, direction, currency, amount, available_delta,
        description, metadata, transaction_date, created_at, updated_at)
     VALUES ($1, $2, 'completed', $3, 'EUR', $4, $4, 'dashboard parity seed', '{}'::jsonb, $5, $5, $5)`,
    [userId, type, direction, amount, at],
  );
}

async function snapshot() {
  const [dash, fin] = await Promise.all([getDashboardSummary(WINDOW), callSummary(WINDOW)]);
  return { dash, fin };
}

let before;
let after;
const offeringName = `Parity membership ${RUN}`;

beforeAll(async () => {
  // The dashboard summary caches by date range; never serve the baseline twice.
  await jest.unstable_mockModule('../../../../backend/services/cacheService.js', () => ({
    cacheService: { get: jest.fn(async () => null), set: jest.fn(async () => {}), del: jest.fn(async () => {}) },
  }));
  ({ pool } = await import('../../../../backend/db.js'));
  ({ getDashboardSummary } = await import('../../../../backend/services/dashboardSummaryService.js'));
  const router = (await import('../../../../backend/routes/finances.js')).default;
  summaryHandler = lastHandler(router, '/summary');

  before = await snapshot();

  const userId = await createStudent();
  // In window: accommodation charge (revenue), customer refund, wallet deposit (not revenue).
  await seedWallet({ userId, type: 'accommodation_charge', direction: 'debit', amount: -300, at: '2005-02-10T10:00:00Z' });
  await seedWallet({ userId, type: 'refund', direction: 'credit', amount: 40, at: '2005-02-11T10:00:00Z' });
  await seedWallet({ userId, type: 'wallet_deposit', direction: 'credit', amount: 500, at: '2005-02-12T10:00:00Z' });
  // Legacy table row in the window: must be ignored.
  const { rows: [legacy] } = await pool.query(
    `INSERT INTO transactions (user_id, amount, type, description, transaction_date, status)
     VALUES ($1, 99999, 'payment', 'legacy table seed', '2005-02-15T10:00:00Z', 'completed') RETURNING id`,
    [userId],
  );
  created.legacyTx.push(legacy.id);

  // Membership: one expired purchase IN the window (revenue, not active) and
  // one active purchase made BEFORE the window (active, not "new in range").
  const { rows: [offering] } = await pool.query(
    `INSERT INTO member_offerings (name, price, period) VALUES ($1, 120, 'season') RETURNING id`,
    [offeringName],
  );
  created.offerings.push(offering.id);
  await pool.query(
    `INSERT INTO member_purchases (user_id, offering_id, offering_name, offering_price, purchased_at, expires_at, status, payment_status)
     VALUES ($1, $2, $3, 120, '2005-02-20T10:00:00Z', '2005-12-31T00:00:00Z', 'expired', 'completed'),
            ($1, $2, $3, 80,  '2004-12-01T10:00:00Z', NULL,                    'active',  'completed')`,
    [userId, offering.id, offeringName],
  );

  after = await snapshot();
});

afterAll(async () => {
  if (!pool) return;
  const users = created.users;
  const cleanup = [
    ['DELETE FROM member_purchases WHERE user_id = ANY($1::uuid[])', [users]],
    ['DELETE FROM member_offerings WHERE id = ANY($1::int[])', [created.offerings]],
    ['DELETE FROM transactions WHERE id = ANY($1::uuid[])', [created.legacyTx]],
    ['DELETE FROM wallet_transactions WHERE user_id = ANY($1::uuid[])', [users]],
    ['DELETE FROM wallet_balances WHERE user_id = ANY($1::uuid[])', [users]],
    ['DELETE FROM users WHERE id = ANY($1::uuid[])', [users]],
  ];
  for (const [sql, params] of cleanup) {
    try { await pool.query(sql, params); } catch { /* best-effort cleanup */ }
  }
});

describe('dashboard summary revenue == /finances/summary', () => {
  test('income, refunds, transactions and net match the Finances page', () => {
    const { dash, fin } = after;
    const finNet = d(fin.revenue.total_revenue).minus(fin.revenue.total_refunds)
      .minus(fin.netRevenue.instructor_commission).minus(fin.managerCommission.total);

    expect(dash.revenue.income).toBeCloseTo(Number(fin.revenue.total_revenue), 2);
    expect(dash.revenue.refunds).toBeCloseTo(Number(fin.revenue.total_refunds), 2);
    expect(dash.revenue.transactions).toBe(Number(fin.revenue.total_transactions));
    expect(dash.revenue.net).toBeCloseTo(finNet.toNumber(), 2);
  });

  test('the seeded rows move the totals as expected; the legacy table is ignored', () => {
    // revenue: accommodation 300 + membership 120 (in window); deposit is not revenue
    expect(delta(after.dash.revenue.income, before.dash.revenue.income)).toBe(420);
    expect(delta(after.dash.revenue.refunds, before.dash.revenue.refunds)).toBe(40);
    expect(delta(after.dash.revenue.net, before.dash.revenue.net)).toBe(380);
    // counted ledger rows: accommodation charge, refund, deposit
    expect(after.dash.revenue.transactions - before.dash.revenue.transactions).toBe(3);
    expect(delta(after.dash.revenue.expenses, before.dash.revenue.expenses)).toBe(-40);
  });

  test('active members ignore the purchase date; new-in-range counts the window', () => {
    const entry = after.dash.membership.offeringBreakdown.find((m) => m.offeringName === offeringName);
    expect(entry).toEqual({ offeringName, activeCount: 1, totalPurchased: 1 });
  });
});
