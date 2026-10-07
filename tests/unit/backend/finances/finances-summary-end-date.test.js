// Regression: finance reports dropped most of the END day.
//
// wallet_transactions.transaction_date is TIMESTAMPTZ, but /finances/summary (and
// /reports/profit-loss, /revenue-analytics, the cash-mode aggregator, …) filtered
// with `transaction_date <= $2::date` — the date casts to 00:00, so a report for
// 2026-07-01..2026-10-07 silently excluded everything after midnight on 10-07.
// The end bound is now `< ($2::date + interval '1 day')` (whole end day, same as
// /overview); the start bound is unchanged.
//
// Runs against the LOCAL dev DB (backend/.env → localhost:5432/plannivo_dev), in
// an isolated far-past window (April 2003), asserting deltas over whatever the
// window held before. Cleans up after itself.

import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';

import { pool } from '../../../../backend/db.js';

const WINDOW_START = '2003-04-01';
const WINDOW_END = '2003-04-30';
const START_DAY_MIDNIGHT = '2003-04-01T00:00:00Z'; // start bound stays inclusive
const END_DAY_AFTERNOON = '2003-04-30T15:00:00Z'; // the regression: was excluded
const END_DAY_LATE = '2003-04-30T23:59:30Z';
const NEXT_DAY = '2003-05-01T00:00:00Z'; // first instant after the window
const BEFORE_START = '2003-03-31T23:59:59Z';

const createdUsers = [];
const handlers = {};

function lastHandler(router, path) {
  const layer = router.stack.find((l) => l.route?.path === path && l.route.methods.get);
  if (!layer) throw new Error(`${path} handler not found`);
  const stack = layer.route.stack.map((s) => s.handle);
  return stack[stack.length - 1]; // skip auth / authorize / cache middleware
}

function call(handler, query, params = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      json: (body) => resolve(body),
      status: (code) => ({ json: (body) => reject(new Error(`HTTP ${code}: ${JSON.stringify(body)}`)) }),
    };
    Promise.resolve(handler({ query, params, user: { id: null, role: 'admin' } }, res)).catch(reject);
  });
}

async function createUser() {
  const id = randomUUID();
  const { rows } = await pool.query(`SELECT id FROM roles WHERE name = 'student' LIMIT 1`);
  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role_id, created_at, updated_at)
     VALUES ($1, 'End Day', $2, 'test-hash', $3, NOW(), NOW())`,
    [id, `endday-${id.slice(0, 8)}@test.com`, rows[0]?.id || null]
  );
  createdUsers.push(id);
  return id;
}

async function seedTx({ userId, type, direction, amount, txDate, relatedEntityType = null }) {
  await pool.query(
    `INSERT INTO wallet_transactions
       (user_id, transaction_type, status, direction, currency, amount, available_delta,
        description, metadata, related_entity_type, transaction_date, created_at, updated_at)
     VALUES ($1, $2, 'completed', $3, 'EUR', $4, $4, 'end-day regression seed', '{}'::jsonb, $5, $6, $6, $6)`,
    [userId, type, direction, amount, relatedEntityType, txDate]
  );
}

const delta = (after, before) => new Decimal(after ?? 0).minus(new Decimal(before ?? 0)).toNumber();
const plRow = (body, category) =>
  body.report.data.find((r) => r.category === category) || { amount: 0 };

beforeAll(async () => {
  const router = (await import('../../../../backend/routes/finances.js')).default;
  handlers.summary = lastHandler(router, '/summary');
  handlers.reports = lastHandler(router, '/reports/:type');
});

afterAll(async () => {
  if (createdUsers.length) {
    await pool.query('DELETE FROM wallet_transactions WHERE user_id = ANY($1::uuid[])', [createdUsers]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUsers]);
  }
  await pool.end();
});

describe('finance reports include the whole end day', () => {
  test('/summary counts a transaction at 15:00 on the end date (and nothing after the window)', async () => {
    const q = { startDate: WINDOW_START, endDate: WINDOW_END };
    const before = await call(handlers.summary, q);

    const user = await createUser();
    // Inside the window
    await seedTx({ userId: user, type: 'payment', direction: 'credit', amount: '25.00', txDate: START_DAY_MIDNIGHT });
    await seedTx({ userId: user, type: 'payment', direction: 'debit', amount: '-40.00', txDate: END_DAY_AFTERNOON, relatedEntityType: 'shop_order' });
    await seedTx({ userId: user, type: 'refund', direction: 'credit', amount: '12.50', txDate: END_DAY_LATE });
    // Outside the window (either side) — must not count
    await seedTx({ userId: user, type: 'refund', direction: 'credit', amount: '99.00', txDate: NEXT_DAY });
    await seedTx({ userId: user, type: 'refund', direction: 'credit', amount: '77.00', txDate: BEFORE_START });
    await seedTx({ userId: user, type: 'payment', direction: 'debit', amount: '-55.00', txDate: NEXT_DAY, relatedEntityType: 'shop_order' });

    const after = await call(handlers.summary, q);

    // start-day 00:00 + end-day 15:00 + end-day 23:59:30
    expect(delta(after.revenue.total_transactions, before.revenue.total_transactions)).toBe(3);
    expect(delta(after.revenue.total_refunds, before.revenue.total_refunds)).toBe(12.5);
    // shop revenue query (related_entity_type = 'shop_order') — the 15:00 end-day sale
    expect(delta(after.revenue.shop_revenue, before.revenue.shop_revenue)).toBe(40);
    expect(delta(after.revenue.shop_order_count, before.revenue.shop_order_count)).toBe(1);
  });

  test('/reports/profit-loss uses the same inclusive end day', async () => {
    const q = { startDate: WINDOW_START, endDate: WINDOW_END };
    const before = await call(handlers.reports, q, { type: 'profit-loss' });

    const user = await createUser();
    await seedTx({ userId: user, type: 'payment', direction: 'credit', amount: '30.00', txDate: END_DAY_AFTERNOON });
    await seedTx({ userId: user, type: 'refund', direction: 'credit', amount: '8.00', txDate: END_DAY_AFTERNOON });
    await seedTx({ userId: user, type: 'payment', direction: 'credit', amount: '500.00', txDate: NEXT_DAY });

    const after = await call(handlers.reports, q, { type: 'profit-loss' });

    expect(delta(plRow(after, 'Revenue').amount, plRow(before, 'Revenue').amount)).toBe(30);
    expect(delta(plRow(after, 'Refunds').amount, plRow(before, 'Refunds').amount)).toBe(-8);
  });
});
