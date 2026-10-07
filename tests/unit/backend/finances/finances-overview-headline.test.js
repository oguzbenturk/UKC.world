// Regression: GET /finances/overview headline numbers.
//
// wallet_transactions.amount is SIGNED (debits negative, not enforced — see the
// discount_adjustment_reversal row below) and stored in the wallet's own
// currency. The handler used to SUM(amount) raw, so:
//   - totalCharges / serviceRevenue came back NEGATIVE,
//   - net = totalIncome − (negative charges) added the two magnitudes together
//     and carried a float artefact (…23999999999),
//   - TRY rows were added to EUR totals at face value,
//   - booking_cancelled_refund / rental_cancelled_refund (canonical REFUND_TYPES)
//     were missing from "refunds issued".
//
// Runs against the LOCAL dev DB (backend/.env → localhost:5432/plannivo_dev).
// Seeds a small ledger in an isolated far-past window (January 2001) and asserts
// the exact EUR headline as a delta over whatever the window held before, so a
// stray row cannot break it. Cleans up after itself.

import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';

import { pool } from '../../../../backend/db.js';

const WINDOW_START = '2001-01-01';
const WINDOW_END = '2001-01-31';
const IN_WINDOW = '2001-01-15T10:00:00Z';
const OUT_OF_WINDOW = '2001-02-10T10:00:00Z';

const created = {
  users: [],
  bookings: [],
};

let overviewHandler;
let tryRate = null; // Decimal units-per-EUR, or null when TRY is not an active currency

async function createUser(roleName) {
  const id = randomUUID();
  const { rows } = await pool.query(`SELECT id FROM roles WHERE name = $1 LIMIT 1`, [roleName]);
  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'test-hash', $4, NOW(), NOW())`,
    [id, `Overview ${roleName}`, `ovw-${id.slice(0, 8)}@test.com`, rows[0]?.id || null]
  );
  created.users.push(id);
  return id;
}

// Direct ledger insert: the handler reads the ledger only, and the balance
// cache / negative-balance guard are irrelevant here. created_at and
// transaction_date are pinned to the same instant so the test is insensitive
// to which of the two the handler filters on.
async function seedTx({
  userId,
  type,
  direction,
  amount,
  currency = 'EUR',
  status = 'completed',
  entityType = null,
  at = IN_WINDOW,
}) {
  await pool.query(
    `INSERT INTO wallet_transactions
       (user_id, transaction_type, status, direction, currency, amount, available_delta,
        description, entity_type, metadata, transaction_date, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6, 'overview regression seed', $7, '{}'::jsonb, $8, $8, $8)`,
    [userId, type, status, direction, currency, amount, entityType, at]
  );
}

function callOverview(start_date, end_date) {
  return new Promise((resolve, reject) => {
    const res = {
      json: (body) => resolve(body),
      status: (code) => ({ json: (body) => reject(new Error(`HTTP ${code}: ${JSON.stringify(body)}`)) }),
    };
    Promise.resolve(overviewHandler({ query: { start_date, end_date } }, res)).catch(reject);
  });
}

const dec = (v) => new Decimal(v ?? 0);
const delta = (after, before) => dec(after).minus(dec(before)).toNumber();
const findMonth = (body, month) => body.monthlyTrend.find((m) => m.month === month) || { income: 0, charges: 0, net: 0 };
const findExpense = (body, type) => body.expenseBreakdown.find((e) => e.type === type) || { total: 0, count: 0 };

// Money fields must be clean 2-dp numbers — no float artefacts like 98311.23999999999.
const CENTS = /^-?\d+(\.\d{1,2})?$/;

beforeAll(async () => {
  const financesRouter = (await import('../../../../backend/routes/finances.js')).default;
  const layer = financesRouter.stack.find(
    (routeLayer) => routeLayer.route?.path === '/overview' && routeLayer.route.methods.get
  );
  if (!layer) throw new Error('/overview handler not found');
  const handlers = layer.route.stack.map((stackLayer) => stackLayer.handle);
  overviewHandler = handlers[handlers.length - 1]; // skip auth / authorize / cache middleware

  const { rows } = await pool.query(
    `SELECT exchange_rate FROM currency_settings WHERE currency_code = 'TRY' AND is_active = true LIMIT 1`
  );
  if (rows[0]) tryRate = new Decimal(rows[0].exchange_rate);
});

afterAll(async () => {
  if (created.users.length) {
    await pool.query('DELETE FROM wallet_transactions WHERE user_id = ANY($1::uuid[])', [created.users]);
    await pool.query('DELETE FROM instructor_earnings WHERE instructor_id = ANY($1::uuid[])', [created.users]);
    await pool.query('DELETE FROM manager_commissions WHERE manager_user_id = ANY($1::uuid[])', [created.users]);
  }
  if (created.bookings.length) {
    await pool.query('DELETE FROM bookings WHERE id = ANY($1::uuid[])', [created.bookings]);
  }
  if (created.users.length) {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [created.users]);
  }
  await pool.end();
});

describe('GET /finances/overview headline', () => {
  test('charges are positive magnitudes, net = income − charges, EUR-normalised, 2 dp', async () => {
    const before = await callOverview(WINDOW_START, WINDOW_END);

    const customer = await createUser('student');
    const instructor = await createUser('instructor');
    const manager = await createUser('manager');

    // ── Wallet ledger (all EUR unless noted) ────────────────────────────────
    await seedTx({ userId: customer, type: 'wallet_deposit', direction: 'credit', amount: '1000.00' });
    // TRY top-up worth exactly €100 at the current rate (amount = rate × 100).
    const tryAmount = tryRate ? tryRate.times(100).toFixed(4) : null;
    if (tryAmount) {
      await seedTx({ userId: customer, type: 'wallet_deposit', direction: 'credit', amount: tryAmount, currency: 'TRY' });
    }
    await seedTx({ userId: customer, type: 'booking_charge', direction: 'debit', amount: '-250.50' });
    await seedTx({ userId: customer, type: 'rental_charge', direction: 'debit', amount: '-49.50' });
    await seedTx({ userId: customer, type: 'package_purchase', direction: 'debit', amount: '-300.00' });
    await seedTx({ userId: customer, type: 'payment', direction: 'debit', amount: '-80.25' }); // shop sale
    await seedTx({ userId: customer, type: 'refund', direction: 'credit', amount: '20.00' });
    await seedTx({ userId: customer, type: 'booking_cancelled_refund', direction: 'credit', amount: '30.00' });
    // Real-world shape: a debit row whose amount is stored POSITIVE.
    await seedTx({ userId: customer, type: 'discount_adjustment_reversal', direction: 'debit', amount: '10.00' });

    // Must be ignored: staff payout, cancelled row, row outside the window.
    await seedTx({ userId: instructor, type: 'payment', direction: 'credit', amount: '500.00', entityType: 'instructor_payment' });
    await seedTx({ userId: customer, type: 'booking_charge', direction: 'debit', amount: '-999.00', status: 'cancelled' });
    await seedTx({ userId: customer, type: 'wallet_deposit', direction: 'credit', amount: '77.00', at: OUT_OF_WINDOW });

    // ── Instructor earnings: one live booking, one soft-deleted booking ─────
    const liveBooking = randomUUID();
    const deletedBooking = randomUUID();
    await pool.query(
      `INSERT INTO bookings (id, date, duration, status) VALUES ($1, '2001-01-15', 1, 'completed')`,
      [liveBooking]
    );
    await pool.query(
      `INSERT INTO bookings (id, date, duration, status, deleted_at) VALUES ($1, '2001-01-16', 1, 'completed', NOW())`,
      [deletedBooking]
    );
    created.bookings.push(liveBooking, deletedBooking);
    await pool.query(
      `INSERT INTO instructor_earnings
         (instructor_id, booking_id, base_rate, commission_rate, total_earnings, lesson_date, lesson_duration, lesson_amount)
       VALUES ($1, $2, 50, 75, 37.50, '2001-01-15', 1, 50),
              ($1, $3, 50, 75, 99.00, '2001-01-16', 1, 50)`,
      [instructor, liveBooking, deletedBooking]
    );

    // ── Manager commissions: one live, one cancelled ───────────────────────
    await pool.query(
      `INSERT INTO manager_commissions
         (manager_user_id, source_type, source_id, source_amount, commission_rate, commission_amount, period_month, status, source_date)
       VALUES ($1, 'membership', 'ovw-live', 100, 12.34, 12.34, '2001-01', 'pending', '2001-01-15'),
              ($1, 'membership', 'ovw-cancelled', 100, 50, 50.00, '2001-01', 'cancelled', '2001-01-15')`,
      [manager]
    );

    const after = await callOverview(WINDOW_START, WINDOW_END);

    const tryEur = tryAmount ? 100 : 0;
    const expectedIncome = new Decimal('1000').plus(tryEur).plus('20').plus('30').toNumber();   // 1150.00
    const expectedCharges = new Decimal('250.50').plus('49.50').plus('300').plus('80.25').plus('10').toNumber(); // 690.25
    const expectedDeposits = new Decimal('1000').plus(tryEur).toNumber();                      // 1100.00

    // Headline
    const hb = before.headline;
    const ha = after.headline;
    expect(delta(ha.totalIncome, hb.totalIncome)).toBe(expectedIncome);
    expect(delta(ha.totalCharges, hb.totalCharges)).toBe(expectedCharges);
    expect(ha.totalCharges).toBeGreaterThan(0);
    expect(delta(ha.net, hb.net)).toBe(new Decimal(expectedIncome).minus(expectedCharges).toNumber()); // 459.75
    expect(delta(ha.totalDeposits, hb.totalDeposits)).toBe(expectedDeposits);
    expect(delta(ha.serviceRevenue, hb.serviceRevenue)).toBe(300); // booking_charge + rental_charge
    expect(ha.serviceRevenue).toBeGreaterThan(0);
    expect(delta(ha.totalRefunds, hb.totalRefunds)).toBe(50);      // refund + booking_cancelled_refund
    expect(delta(ha.instructorCommission, hb.instructorCommission)).toBe(37.5);
    expect(delta(ha.managerCommission, hb.managerCommission)).toBe(12.34);
    expect(ha.totalTransactions - hb.totalTransactions).toBe(tryAmount ? 9 : 8);

    // net is exactly income − charges on the returned (rounded) numbers.
    expect(new Decimal(ha.totalIncome).minus(ha.totalCharges).toNumber()).toBe(ha.net);

    for (const key of ['totalIncome', 'totalCharges', 'net', 'totalRefunds', 'totalDeposits', 'serviceRevenue', 'instructorCommission', 'managerCommission']) {
      expect(String(ha[key])).toMatch(CENTS);
    }

    // managerCommission block mirrors the headline
    expect(after.managerCommission.total).toBe(ha.managerCommission);
    expect(delta(after.managerCommission.byServiceType.membership, before.managerCommission?.byServiceType?.membership)).toBe(12.34);

    // Service breakdown (positive magnitudes)
    expect(delta(after.serviceBreakdown.lessons, before.serviceBreakdown.lessons)).toBe(250.5);
    expect(delta(after.serviceBreakdown.rentals, before.serviceBreakdown.rentals)).toBe(49.5);
    expect(delta(after.serviceBreakdown.memberships, before.serviceBreakdown.memberships)).toBe(300);
    expect(delta(after.serviceBreakdown.shop, before.serviceBreakdown.shop)).toBe(80.25);
    expect(delta(after.serviceBreakdown.deposits, before.serviceBreakdown.deposits)).toBe(expectedDeposits);

    // Monthly trend: only January 2001 moves, with the same sign convention.
    const mb = findMonth(before, '2001-01');
    const ma = findMonth(after, '2001-01');
    expect(delta(ma.income, mb.income)).toBe(expectedIncome);
    expect(delta(ma.charges, mb.charges)).toBe(expectedCharges);
    expect(delta(ma.net, mb.net)).toBe(new Decimal(expectedIncome).minus(expectedCharges).toNumber());
    expect(after.monthlyTrend.some((m) => m.month === '2001-02')).toBe(false);

    // Expense breakdown: positive totals, so "ORDER BY total DESC" is largest-first.
    expect(delta(findExpense(after, 'package_purchase').total, findExpense(before, 'package_purchase').total)).toBe(300);
    expect(delta(findExpense(after, 'booking_charge').total, findExpense(before, 'booking_charge').total)).toBe(250.5);
    expect(delta(findExpense(after, 'discount_adjustment_reversal').total, findExpense(before, 'discount_adjustment_reversal').total)).toBe(10);
    const totals = after.expenseBreakdown.map((e) => e.total);
    expect(totals.every((t) => t >= 0)).toBe(true);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
  });
});
