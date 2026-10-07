// Regression: shared REFUND_TYPES coverage + /finances/overview date basis.
//
// 1. rental_refund (written by rentalCleanupService when a rental is
//    force-deleted) was missing from constants/transactions.js REFUND_TYPES, so
//    /finances/summary and /finances/overview under-reported refunds. Every
//    refund type a backend writer posts must be in the list exactly once, and
//    non-refund lookalikes (iyzico_refund debit, *_reversal undo rows,
//    related_entity_type tags) must not be.
// 2. /overview filtered + bucketed wallet_transactions by created_at (insert
//    time) while /summary uses transaction_date (business date). A back-dated
//    row landed in different periods on the two screens. /overview now uses
//    transaction_date with an inclusive end day.
//
// Runs against the LOCAL dev DB (backend/.env → localhost:5432/plannivo_dev),
// in an isolated far-past window (March 2002), asserting deltas over whatever
// the window held before. Cleans up after itself.

import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';

import { pool } from '../../../../backend/db.js';
import { REFUND_TYPES } from '../../../../backend/constants/transactions.js';

const WINDOW_START = '2002-03-01';
const WINDOW_END = '2002-03-31';
const MID = '2002-03-15T10:00:00Z';
const LAST_DAY = '2002-03-31T18:30:00Z'; // inclusive end day (DB TZ is UTC)
const OUTSIDE = '2002-06-10T10:00:00Z';

const createdUsers = [];
const handlers = {};

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
    Promise.resolve(handler({ query, user: { id: null, role: 'admin' } }, res)).catch(reject);
  });
}

async function createUser() {
  const id = randomUUID();
  const { rows } = await pool.query(`SELECT id FROM roles WHERE name = 'student' LIMIT 1`);
  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role_id, created_at, updated_at)
     VALUES ($1, 'Refund Basis', $2, 'test-hash', $3, NOW(), NOW())`,
    [id, `rfb-${id.slice(0, 8)}@test.com`, rows[0]?.id || null]
  );
  createdUsers.push(id);
  return id;
}

async function seedTx({ userId, type, direction, amount, txDate, createdAt = txDate }) {
  await pool.query(
    `INSERT INTO wallet_transactions
       (user_id, transaction_type, status, direction, currency, amount, available_delta,
        description, metadata, transaction_date, created_at, updated_at)
     VALUES ($1, $2, 'completed', $3, 'EUR', $4, $4, 'refund/date-basis regression seed', '{}'::jsonb, $5, $6, $6)`,
    [userId, type, direction, amount, txDate, createdAt]
  );
}

const delta = (after, before) => new Decimal(after ?? 0).minus(new Decimal(before ?? 0)).toNumber();
const month = (body, m) => body.monthlyTrend.find((x) => x.month === m) || { income: 0, charges: 0 };

beforeAll(async () => {
  const router = (await import('../../../../backend/routes/finances.js')).default;
  handlers.overview = lastHandler(router, '/overview');
  handlers.summary = lastHandler(router, '/summary');
});

afterAll(async () => {
  if (createdUsers.length) {
    await pool.query('DELETE FROM wallet_transactions WHERE user_id = ANY($1::uuid[])', [createdUsers]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUsers]);
  }
  await pool.end();
});

describe('REFUND_TYPES list', () => {
  test('contains every refund credit type the backend writes, once', () => {
    for (const type of [
      'refund',
      'booking_cancelled_refund',
      'booking_deleted_refund',
      'rental_cancelled_refund',
      'rental_refund',
      'package_refund',
    ]) {
      expect(REFUND_TYPES).toContain(type);
    }
    expect(new Set(REFUND_TYPES).size).toBe(REFUND_TYPES.length);
  });

  test('excludes non-refund lookalikes', () => {
    for (const type of [
      'iyzico_refund', // debit: wallet money back to card (reverses a deposit)
      'shop_order_refund', // related_entity_type tag on 'refund' rows, not a type
      'member_purchase_refund', // ditto
      'booking_deleted_credit_reversal',
      'discount_adjustment_reversal',
      'payment_reversal',
      'package_purchase_reversal',
    ]) {
      expect(REFUND_TYPES).not.toContain(type);
    }
  });
});

describe('rental_refund is counted as a refund', () => {
  test('/summary total_refunds and /overview totalRefunds include a rental_refund row', async () => {
    const q = { startDate: WINDOW_START, endDate: WINDOW_END };
    const oq = { start_date: WINDOW_START, end_date: WINDOW_END };
    const sBefore = await call(handlers.summary, q);
    const oBefore = await call(handlers.overview, oq);

    const user = await createUser();
    await seedTx({ userId: user, type: 'rental_refund', direction: 'credit', amount: '42.50', txDate: MID });
    // Must NOT count as a refund: card cash-out of a deposit.
    await seedTx({ userId: user, type: 'iyzico_refund', direction: 'debit', amount: '-7.00', txDate: MID });

    const sAfter = await call(handlers.summary, q);
    const oAfter = await call(handlers.overview, oq);

    expect(delta(sAfter.revenue.total_refunds, sBefore.revenue.total_refunds)).toBe(42.5);
    expect(delta(oAfter.headline.totalRefunds, oBefore.headline.totalRefunds)).toBe(42.5);
  });
});

describe('/overview date basis = transaction_date (same as /summary)', () => {
  test('back-dated row counts in its business period; insert time is irrelevant; end day inclusive', async () => {
    const oq = { start_date: WINDOW_START, end_date: WINDOW_END };
    const before = await call(handlers.overview, oq);
    const outsideBefore = await call(handlers.overview, { start_date: '2002-06-01', end_date: '2002-06-30' });

    const user = await createUser();
    // Business date in March, inserted "later" (June) — must be in March.
    await seedTx({ userId: user, type: 'wallet_deposit', direction: 'credit', amount: '100.00', txDate: MID, createdAt: OUTSIDE });
    // Inserted in March but business date June — must NOT be in March.
    await seedTx({ userId: user, type: 'wallet_deposit', direction: 'credit', amount: '900.00', txDate: OUTSIDE, createdAt: MID });
    // Afternoon of the end date — inclusive end day.
    await seedTx({ userId: user, type: 'booking_charge', direction: 'debit', amount: '-25.00', txDate: LAST_DAY });

    const after = await call(handlers.overview, oq);
    const outsideAfter = await call(handlers.overview, { start_date: '2002-06-01', end_date: '2002-06-30' });

    expect(delta(after.headline.totalIncome, before.headline.totalIncome)).toBe(100);
    expect(delta(after.headline.totalDeposits, before.headline.totalDeposits)).toBe(100);
    expect(delta(after.headline.totalCharges, before.headline.totalCharges)).toBe(25);
    expect(after.headline.totalTransactions - before.headline.totalTransactions).toBe(2);
    expect(delta(month(after, '2002-03').income, month(before, '2002-03').income)).toBe(100);
    expect(delta(month(after, '2002-03').charges, month(before, '2002-03').charges)).toBe(25);

    // The June-business-date row lands in June, keyed by transaction_date.
    expect(delta(outsideAfter.headline.totalIncome, outsideBefore.headline.totalIncome)).toBe(900);
    expect(delta(month(outsideAfter, '2002-06').income, month(outsideBefore, '2002-06').income)).toBe(900);
  });
});
