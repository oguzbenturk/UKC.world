import { pool } from '../db.js';
import { PAYMENT_TYPES, REFUND_TYPES } from '../constants/transactions.js';

// Configurable threshold for large unpaid rentals
const LARGE_UNPAID_THRESHOLD = Number(process.env.LARGE_UNPAID_RENTAL_THRESHOLD || 100);

// Cash-in (income) and refund (cash-out) transaction types. The legacy `transactions`
// table this service used to read was frozen ~2026-05-30 when the app switched its
// ledger to wallet_transactions, so daily totals read ~0 for any recent date. We now
// read wallet_transactions using the same cash-basis type sets the rest of finances
// uses. Deposits/top-ups count as money received; charges (debits against prepaid
// balance) are NOT "payments" and are excluded.
const DAILY_INCOME_TYPES = [...new Set([...PAYMENT_TYPES, 'wallet_deposit', 'deposit', 'bank_transfer_payment'])];
const DAILY_REFUND_TYPES = [...new Set([...REFUND_TYPES, 'iyzico_refund'])];

function getDayRange(dateStr) {
  const start = new Date(dateStr + 'T00:00:00.000Z');
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function fetchDailyPayments(start, end) {
  const result = await pool.query(
    `SELECT
        wt.id,
        wt.user_id,
        -- Income positive, refunds negative (regardless of stored ledger sign), each
        -- normalised to EUR so mixed-currency rows don't distort the day's totals.
        CASE
          WHEN wt.transaction_type = ANY($3) THEN  ABS(wt.amount) / COALESCE(cs.exchange_rate, 1)
          WHEN wt.transaction_type = ANY($4) THEN -ABS(wt.amount) / COALESCE(cs.exchange_rate, 1)
          ELSE 0
        END AS amount,
        -- Normalise refund variants to 'refund' so the anomaly + colour logic key off it;
        -- the human-readable specifics remain in description.
        CASE WHEN wt.transaction_type = ANY($4) THEN 'refund' ELSE wt.transaction_type END AS type,
        wt.description,
        wt.payment_method,
        wt.rental_id,
        wt.transaction_date,
        wt.created_by
     FROM wallet_transactions wt
     LEFT JOIN currency_settings cs ON cs.currency_code = wt.currency AND cs.is_active = true
     WHERE wt.transaction_date >= $1 AND wt.transaction_date < $2
       AND wt.status = 'completed'
       AND (wt.transaction_type = ANY($3) OR wt.transaction_type = ANY($4))
       -- Keep staff payouts (salary/commission) out of customer cash totals.
       AND (wt.entity_type IS NULL OR wt.entity_type NOT IN ('manager_payment','instructor_payment','manager','instructor'))
     ORDER BY wt.transaction_date ASC, wt.created_at ASC`,
    [start, end, DAILY_INCOME_TYPES, DAILY_REFUND_TYPES]
  );
  return result.rows.map(r => ({
    ...r,
    reference_number: null,
    amount: Number(r.amount) || 0
  }));
}

export async function fetchRentalsCreated(start, end) {
  const result = await pool.query(
    `SELECT id, user_id, start_date, end_date, status, total_price, payment_status, created_at
     FROM rentals
     WHERE created_at >= $1 AND created_at < $2
     ORDER BY created_at ASC`,
    [start, end]
  );
  return result.rows.map(r => ({
    ...r,
    total_price: Number(r.total_price) || 0
  }));
}

export async function fetchRentalsActive(start, end) {
  const result = await pool.query(
    `SELECT id, user_id, start_date, end_date, status, total_price, payment_status, created_at
     FROM rentals
     WHERE start_date < $2 AND end_date >= $1
     ORDER BY start_date ASC`,
    [start, end]
  );
  return result.rows.map(r => ({
    ...r,
    total_price: Number(r.total_price) || 0
  }));
}

function indexPaymentsByRental(payments) {
  const map = new Map();
  for (const p of payments) {
    if (!p.rental_id) continue;
    if (!map.has(p.rental_id)) map.set(p.rental_id, []);
    map.get(p.rental_id).push(p);
  }
  return map;
}

function detectAnomalies({ rentalsCreated, rentalsActive, payments }) {
  const anomalies = {
    unmatchedPaidRentals: [],
    transactionsWithoutPaidRental: [],
    overdueActiveRentals: [],
    duplicateReferences: [],
    negativeOrZeroTransactions: [],
    largeActiveUnpaidRentals: []
  };

  const referenceMap = new Map();
  const rentalStatusMap = new Map();
  const allRentals = [...rentalsCreated, ...rentalsActive];
  for (const r of allRentals) rentalStatusMap.set(r.id, r);

  // Reference duplicates
  for (const p of payments) {
    if (p.reference_number) {
      const list = referenceMap.get(p.reference_number) || [];
      list.push(p.id);
      referenceMap.set(p.reference_number, list);
    }
    if (p.amount <= 0 && !['refund', 'adjustment'].includes(p.type)) {
      anomalies.negativeOrZeroTransactions.push(p.id);
    }
  }
  for (const [ref, ids] of referenceMap.entries()) {
    if (ids.length > 1) anomalies.duplicateReferences.push({ reference_number: ref, transaction_ids: ids });
  }

  const paymentsByRental = indexPaymentsByRental(payments);
  const seenRentalIds = new Set();

  // Unmatched paid rentals & large unpaid
  for (const rental of allRentals) {
    if (seenRentalIds.has(rental.id)) continue;
    seenRentalIds.add(rental.id);
    const rentalPayments = paymentsByRental.get(rental.id) || [];
    const paidToday = rentalPayments.reduce((s, p) => s + p.amount, 0);
    rental.amount_paid_today = paidToday;
    rental.has_payments_today = rentalPayments.length > 0;
    const isMarkedPaid = ['paid', 'closed'].includes(rental.payment_status);
    if (isMarkedPaid && paidToday + 0.01 < rental.total_price) {
      anomalies.unmatchedPaidRentals.push(rental.id);
    }
    const now = new Date();
    if (rental.status && ['active', 'in_progress'].includes(rental.status) && new Date(rental.end_date) < now) {
      anomalies.overdueActiveRentals.push(rental.id);
    }
    const unpaid = rental.total_price - paidToday;
    if (['active', 'in_progress', 'pending'].includes(rental.status) && unpaid >= LARGE_UNPAID_THRESHOLD) {
      anomalies.largeActiveUnpaidRentals.push(rental.id);
    }
  }

  // Transactions referencing rentals not in paid status
  for (const p of payments) {
    if (p.rental_id) {
      const r = rentalStatusMap.get(p.rental_id);
      if (r && !['paid', 'closed'].includes(r.payment_status)) {
        anomalies.transactionsWithoutPaidRental.push(p.id);
      }
    }
  }

  return anomalies;
}

function summarize({ rentalsCreated, rentalsActive, payments, anomalies }) {
  const paymentsGross = payments.reduce((s, p) => s + p.amount, 0);
  const byMethod = {};
  payments.forEach(p => { byMethod[p.payment_method || 'unknown'] = (byMethod[p.payment_method || 'unknown'] || 0) + p.amount; });

  const expectedCreated = rentalsCreated.reduce((s, r) => s + r.total_price, 0);
  const expectedActive = rentalsActive.reduce((s, r) => s + r.total_price, 0);
  const rentalRevenueReceived = payments.filter(p => p.rental_id).reduce((s, p) => s + p.amount, 0);

  return {
    payments: { count: payments.length, gross: paymentsGross, by_method: byMethod },
    rentals: {
      created_count: rentalsCreated.length,
      active_count: rentalsActive.length,
      expected_rental_revenue_created: expectedCreated,
      expected_rental_revenue_active: expectedActive,
      rental_revenue_received: rentalRevenueReceived,
      unmatched_paid_rentals: anomalies.unmatchedPaidRentals.length
    }
  };
}

export async function getDailyOperations({ date, rentalsScope = 'both' }) {
  const { start, end } = getDayRange(date);
  const [payments, rentalsCreated, rentalsActive] = await Promise.all([
    fetchDailyPayments(start, end),
    ['created', 'both'].includes(rentalsScope) ? fetchRentalsCreated(start, end) : Promise.resolve([]),
    ['active', 'both'].includes(rentalsScope) ? fetchRentalsActive(start, end) : Promise.resolve([])
  ]);

  const anomalies = detectAnomalies({ rentalsCreated, rentalsActive, payments });
  const totals = summarize({ rentalsCreated, rentalsActive, payments, anomalies });

  return {
    date,
    timezone: 'UTC',
    rentalsScope,
    payments,
    rentalsCreated,
    rentalsActive,
    totals,
    anomalies,
    generated_at: new Date().toISOString()
  };
}
