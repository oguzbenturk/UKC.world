// Staff earnings as a spendable balance — "My Wallet" for instructors/managers
// and "Pay with my earnings" at shop checkout (owner decisions 2026-10-08).
//
// Earnings stay where payroll already keeps them:
//   * instructor: completed lessons (loadInstructorLedger → same chain as the
//     earnings page, payroll and dashboard),
//   * manager:    manager_commissions dated up to today (getManagerOwedBalance).
// Staff payout rows (wallet_transactions, entity_type instructor_payment /
// manager_payment, available_delta 0) settle those earnings:
//   * payment, payment_method 'earnings' → spent in the app (an in-app purchase),
//   * payment, any other method          → paid out (cash, bank transfer…),
//   * deduction (negative)               → a charge to the staff member.
// available = max(earned − paidOutCash − spentInApp − deducted, 0) — it never
// goes below zero (decision 4) and a later commission cut is simply absorbed by
// the next payout (decision 6). Manager + instructor staff are ONE payee: both
// channels are combined. Money is Decimal.js; amounts are EUR (the ledger base).

import Decimal from 'decimal.js';
import { pool } from '../db.js';
import { loadInstructorLedger, BASE_CURRENCY } from './instructorPayoutService.js';
import { getManagerOwedBalance } from './managerCommissionService.js';
import { createStaffPayment, STAFF_KIND } from './staffPaymentService.js';
import {
  STAFF_EARNINGS_PAYMENT_METHOD,
  STAFF_EARNINGS_SPEND_KIND,
  STAFF_EARNINGS_WALLET_START,
  hasStaffEarnings,
} from '../constants/staffEarnings.js';

const dec = (v) => {
  try {
    const d = new Decimal(v ?? 0);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
};
const num = (d) => dec(d).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

const isManagerRole = (role) => String(role || '').toLowerCase().trim() === 'manager';

async function loadManagerSpent(userId, executor) {
  const { rows } = await executor.query(
    `SELECT COALESCE(SUM(amount), 0) AS spent
       FROM wallet_transactions
      WHERE user_id = $1
        AND entity_type = 'manager_payment'
        AND transaction_type = 'payment'
        AND payment_method = $2
        AND amount > 0
        AND status != 'cancelled'`,
    [userId, STAFF_EARNINGS_PAYMENT_METHOD],
  );
  return dec(rows[0]?.spent);
}

/**
 * Earnings balance of one staff member, or null for roles without earnings
 * (receptionist, front desk, customers…).
 * @returns {Promise<null|{currency, earned, paidOut, spentInApp, deducted, available, startDate}>}
 */
export async function getStaffEarningsBalance(userId, { role, executor = pool } = {}) {
  if (!userId || !hasStaffEarnings(role)) return null;

  const instructor = await loadInstructorLedger(userId, { executor });
  const ib = instructor.balances;

  let mEarned = dec(0);
  let mPaidAll = dec(0);
  let mDeducted = dec(0);
  let mSpent = dec(0);
  if (isManagerRole(role)) {
    const owed = await getManagerOwedBalance(userId, {}, executor);
    mEarned = dec(owed.earned);
    mPaidAll = dec(owed.paid);
    mDeducted = dec(owed.deducted);
    mSpent = await loadManagerSpent(userId, executor);
  }

  const earned = dec(ib.totalEarned).plus(mEarned);
  const spentInApp = dec(ib.spentInApp).plus(mSpent);
  const paidOut = dec(ib.paidOutGross).minus(ib.spentInApp).plus(mPaidAll).minus(mSpent);
  const deducted = dec(ib.deductionsTotal).plus(mDeducted);
  const available = Decimal.max(earned.minus(paidOut).minus(spentInApp).minus(deducted), 0);

  return {
    currency: BASE_CURRENCY,
    earned: num(earned),
    paidOut: num(paidOut),
    spentInApp: num(spentInApp),
    deducted: num(deducted),
    available: num(available),
    startDate: STAFF_EARNINGS_WALLET_START,
  };
}

/**
 * Recent earnings movements for My Wallet: lessons/commissions earned, payouts,
 * in-app purchases and deductions, newest first.
 */
export async function getStaffEarningsActivity(userId, { role, limit = 50, executor = pool } = {}) {
  if (!userId || !hasStaffEarnings(role)) return [];
  const cap = Math.max(1, Math.min(Number(limit) || 50, 200));

  const [instructor, managerRows] = await Promise.all([
    loadInstructorLedger(userId, { executor }),
    isManagerRole(role)
      ? executor.query(
        `SELECT id, source_type, commission_amount, source_date
           FROM manager_commissions
          WHERE manager_user_id = $1 AND status != 'cancelled' AND source_date <= CURRENT_DATE
          ORDER BY source_date DESC, created_at DESC
          LIMIT $2`,
        [userId, cap],
      )
      : Promise.resolve({ rows: [] }),
  ]);

  const items = [];
  for (const l of instructor.lessons) {
    items.push({
      kind: 'earned', source: 'lesson', id: String(l.id), date: l.date, amount: num(l.amount),
      label: l.lessonType || null, detail: l.student || null,
    });
  }
  for (const c of managerRows.rows) {
    const date = c.source_date instanceof Date ? c.source_date.toISOString().slice(0, 10) : String(c.source_date).slice(0, 10);
    items.push({
      kind: 'earned', source: 'commission', id: String(c.id), date, amount: num(c.commission_amount),
      label: c.source_type || null, detail: null,
    });
  }
  for (const p of instructor.payouts) {
    items.push({
      kind: p.kind === 'deduction' ? 'deducted' : (p.inApp ? 'spent' : 'paid_out'),
      source: 'payroll', id: String(p.id), date: p.date, amount: num(p.amount),
      label: p.description || null, detail: p.method || null,
    });
  }
  if (isManagerRole(role)) {
    const { rows } = await executor.query(
      `SELECT id, amount, description, payment_method,
              TO_CHAR(COALESCE((metadata->>'paymentDate')::timestamptz, created_at), 'YYYY-MM-DD') AS date
         FROM wallet_transactions
        WHERE user_id = $1 AND entity_type = 'manager_payment'
          AND transaction_type IN ('payment', 'deduction') AND status != 'cancelled'
        ORDER BY created_at DESC LIMIT $2`,
      [userId, cap],
    );
    for (const r of rows) {
      const amount = dec(r.amount);
      const kind = amount.lt(0) ? 'deducted' : (r.payment_method === STAFF_EARNINGS_PAYMENT_METHOD ? 'spent' : 'paid_out');
      items.push({
        kind, source: 'payroll', id: String(r.id), date: r.date, amount: num(amount.abs()),
        label: r.description || null, detail: r.payment_method || null,
      });
    }
  }

  return items
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, cap);
}

/**
 * Record an in-app purchase paid from earnings: a staff payout row
 * (payment_method 'earnings', available_delta 0) linked to the source. Must run
 * inside the caller's transaction AFTER it took the per-user advisory lock and
 * checked the balance (see lockStaffEarnings). The unique index from migration
 * 293 makes a second live spend for the same source fail with 409.
 */
export async function recordEarningsSpend({
  client, userId, role, amount, sourceType, sourceId, description, actorId, extraMetadata = {},
}) {
  const value = dec(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (value.lte(0)) return null;
  try {
    const { transactionRecord } = await createStaffPayment({
      kind: isManagerRole(role) ? STAFF_KIND.MANAGER : STAFF_KIND.INSTRUCTOR,
      userId,
      amount: value.toNumber(),
      description,
      paymentMethod: STAFF_EARNINGS_PAYMENT_METHOD,
      actorId: actorId || userId,
      client,
      extraMetadata: {
        kind: STAFF_EARNINGS_SPEND_KIND,
        sourceType,
        sourceId: String(sourceId),
        ...extraMetadata,
      },
    });
    return transactionRecord;
  } catch (error) {
    if (error?.code === '23505') {
      throw Object.assign(new Error('This purchase was already paid with earnings'), {
        statusCode: 409, code: 'EARNINGS_ALREADY_SPENT',
      });
    }
    throw error;
  }
}

/**
 * Serialise earnings spends of one staff member (two checkouts at once cannot
 * both spend the same euros). Transaction-scoped: released at COMMIT/ROLLBACK.
 */
export async function lockStaffEarnings(client, userId) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`staff-earnings:${userId}`]);
}

/**
 * Refund / cancel of a purchase paid with earnings: cancel the linked spend
 * row(s) so the amount is available again. No reversal row and no wallet
 * resync — spend rows carry available_delta 0. Returns the cancelled rows.
 */
export async function cancelEarningsSpendsForSource(client, { sourceType, sourceId, actorId, reason = null }) {
  const { rows } = await client.query(
    `UPDATE wallet_transactions
        SET status = 'cancelled',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'cancelledAt', NOW(), 'cancelledBy', $3::text, 'cancellationReason', $4::text,
              'cancellationOrigin', 'staff-earnings:refund'),
            updated_at = NOW()
      WHERE payment_method = $5
        AND transaction_type = 'payment'
        AND entity_type IN ('instructor_payment', 'manager_payment')
        AND status <> 'cancelled'
        AND metadata->>'sourceType' = $1
        AND metadata->>'sourceId' = $2
      RETURNING id, user_id, amount`,
    [sourceType, String(sourceId), actorId ? String(actorId) : null, reason, STAFF_EARNINGS_PAYMENT_METHOD],
  );
  return rows;
}
