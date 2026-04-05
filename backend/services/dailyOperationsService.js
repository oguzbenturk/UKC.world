import { pool } from '../db.js';

// Configurable threshold for large unpaid rentals
const LARGE_UNPAID_THRESHOLD = Number(process.env.LARGE_UNPAID_RENTAL_THRESHOLD || 100);

function getDayRange(dateStr) {
  const start = new Date(dateStr + 'T00:00:00.000Z');
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function fetchDailyPayments(start, end) {
  const result = await pool.query(
    `SELECT id, user_id, amount, type, description, payment_method, reference_number, rental_id, transaction_date, created_by
     FROM transactions
     WHERE transaction_date >= $1 AND transaction_date < $2
     ORDER BY transaction_date ASC, created_at ASC`,
    [start, end]
  );
  return result.rows.map(r => ({
    ...r,
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
