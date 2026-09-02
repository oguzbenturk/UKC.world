// One-shot data fix for two related wallet defects found on 2026-09-02 while
// investigating the Strauss family's supervision lesson.
//
// ROOT CAUSES (both now fixed in code)
//
//  (1) GROUP DISCOUNT CREDITED TO ONE WALLET — backend/routes/bookings.js
//      applyCreationDiscountForBooking() derived the discount from the GROUP
//      price but wrote a single `discounts` row against the primary student
//      with participant_user_id = NULL, so the whole reduction was credited to
//      that one wallet while every other participant kept paying full price.
//      A €525 3-person lesson set to a €337 custom total posted +€188 to the
//      primary — taking their −€175 charge to a +€13 CREDIT — and €0 to the
//      other two. The route now splits the reduction pro-rata and writes one
//      per-participant discount row, and walletService.fetchTransactions scopes
//      its discount LATERAL to the wallet that actually received the credit.
//
//  (2) DELETED BOOKING LEFT A NET CREDIT — backend/routes/bookings.js
//      refundBookingNetChargesPerUser() refunds via getEntityNetCharges, which
//      only reports payers who still OWE (HAVING sum < 0). A participant left
//      holding a net CREDIT was skipped entirely and kept the money for a
//      lesson that no longer exists. The delete paths now also call
//      zeroOutBookingNetCreditsPerUser().
//
// WHAT THIS DOES
//   PART 1 — every (soft-deleted booking, user, currency) whose COMPLETED rows
//            still net to a CREDIT gets an offsetting
//            `booking_deleted_credit_reversal` debit, using the same
//            idempotency key the live delete path now uses.
//   PART 2 — every LIVE multi-participant booking carrying a NULL-participant
//            discount row is re-split: the old row is removed (which reverses
//            its wallet credit through the normal discountService path) and one
//            per-participant row is written in its place, pro-rata by each
//            payer's booking_participants.payment_amount.
//   Both parts finish by recomputing every touched wallet from the ledger.
//
// Deleted bookings are deliberately NOT re-split — their footprint is zeroed
// instead, since re-applying a discount to a lesson that no longer exists would
// just create new rows to unwind.
//
// Idempotent — a second run finds nothing to repair.
//
// Usage (runs against whatever backend/.env points to — CHECK THAT FIRST):
//   node backend/scripts/repair-group-discount-split.mjs           # dry run
//   node backend/scripts/repair-group-discount-split.mjs --apply

import { pool } from '../db.js';
import { recordTransaction, recomputeBalanceFromLedger } from '../services/walletService.js';
import { applyDiscount } from '../services/discountService.js';

const APPLY = process.argv.includes('--apply');
const fmt = (v, cur = 'EUR') => `${Number(v || 0).toFixed(2)} ${cur}`;

/**
 * Split `totalCents` across `weights` pro-rata, handing the rounding remainder
 * out one cent at a time so the parts sum EXACTLY to the whole. `ceilings` caps
 * each participant (a discount can never exceed that payer's own share).
 * Mirrors the algorithm in applyCreationDiscountForBooking.
 */
function splitCents(totalCents, weights, ceilings) {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (!(weightSum > 0)) return weights.map(() => 0);
  const parts = weights.map((w) => Math.floor((totalCents * w) / weightSum));
  let remainder = totalCents - parts.reduce((a, b) => a + b, 0);
  for (let i = 0; remainder > 0 && i < parts.length * 2; i += 1) {
    const idx = i % parts.length;
    if (parts[idx] < ceilings[idx]) {
      parts[idx] += 1;
      remainder -= 1;
    }
  }
  return parts.map((c, i) => Math.min(c, ceilings[i]));
}

// ── PART 1 ──────────────────────────────────────────────────────────────────
async function repairDeletedBookingCredits(client, touched) {
  const { rows } = await client.query(`
    SELECT wt.booking_id,
           wt.user_id,
           wt.currency,
           u.name AS user_name,
           b.date AS lesson_date,
           COALESCE(SUM(wt.available_delta), 0) AS net
      FROM wallet_transactions wt
      JOIN bookings b ON b.id = wt.booking_id AND b.deleted_at IS NOT NULL
      JOIN users u ON u.id = wt.user_id
     WHERE wt.status = 'completed'
     GROUP BY wt.booking_id, wt.user_id, wt.currency, u.name, b.date
    HAVING COALESCE(SUM(wt.available_delta), 0) > 0.005
     ORDER BY u.name
  `);

  console.log(`\n=== PART 1 — phantom credits on deleted bookings: ${rows.length} found ===`);
  for (const r of rows) {
    const amount = Math.abs(Number(r.net));
    console.log(
      `  ${r.user_name.padEnd(22)} booking ${r.booking_id} (${String(r.lesson_date).slice(0, 10)}) ` +
      `holds ${fmt(amount, r.currency)} for a DELETED lesson`
    );
    if (!APPLY) continue;
    await recordTransaction({
      client,
      userId: r.user_id,
      amount: -amount,
      availableDelta: -amount,
      transactionType: 'booking_deleted_credit_reversal',
      status: 'completed',
      direction: 'debit',
      currency: r.currency || 'EUR',
      description: 'Reversal: leftover credit on deleted booking',
      relatedEntityType: 'booking',
      relatedEntityId: r.booking_id,
      bookingId: r.booking_id,
      idempotencyKey: `booking_deleted-credit-reversal:${r.booking_id}:${r.user_id}:${r.currency}`,
      metadata: { reason: 'booking_deleted', bookingId: r.booking_id, repairScript: 'repair-group-discount-split' },
      allowNegative: true,
    });
    touched.add(`${r.user_id}|${r.currency}`);
  }
  return rows.length;
}

// ── PART 2 ──────────────────────────────────────────────────────────────────
async function repairGroupDiscounts(client, touched) {
  const { rows: bad } = await client.query(`
    SELECT d.id, d.entity_id AS booking_id, d.customer_id, d.amount, d.percent,
           d.reason, d.created_by, d.currency,
           b.amount AS booking_amount, b.final_amount,
           u.name AS credited_to
      FROM discounts d
      JOIN bookings b ON b.id::text = d.entity_id AND b.deleted_at IS NULL
      JOIN users u ON u.id = d.customer_id
     WHERE d.entity_type = 'booking'
       AND d.participant_user_id IS NULL
       AND (SELECT COUNT(*) FROM booking_participants bp WHERE bp.booking_id = b.id) > 1
     ORDER BY d.created_at
  `);

  console.log(`\n=== PART 2 — group discounts credited to one wallet: ${bad.length} found ===`);

  for (const d of bad) {
    const { rows: participants } = await client.query(
      `SELECT bp.user_id, bp.payment_amount, u.name
         FROM booking_participants bp
         JOIN users u ON u.id = bp.user_id
        WHERE bp.booking_id = $1::uuid
        ORDER BY bp.is_primary DESC NULLS LAST, bp.created_at`,
      [d.booking_id]
    );

    const shareCents = participants.map((p) => Math.round((parseFloat(p.payment_amount) || 0) * 100));
    const sumShareCents = shareCents.reduce((a, b) => a + b, 0);
    const totalCents = Math.round(Number(d.amount) * 100);
    const weights = sumShareCents > 0 ? shareCents : participants.map(() => 1);
    const ceilings = sumShareCents > 0 ? shareCents : participants.map(() => totalCents);
    const perCents = splitCents(totalCents, weights, ceilings);

    console.log(
      `\n  Booking ${d.booking_id} — group price ${fmt(d.final_amount ?? d.booking_amount)}, ` +
      `discount ${fmt(d.amount)} currently ALL on ${d.credited_to}`
    );
    participants.forEach((p, i) => {
      console.log(
        `    ${p.name.padEnd(22)} share ${fmt(p.payment_amount)} → discount ${fmt(perCents[i] / 100)} ` +
        `→ owes ${fmt((shareCents[i] - perCents[i]) / 100)}`
      );
    });

    if (!APPLY) continue;

    // Remove the group-wide row first. applyDiscount's zero-amount path reverses
    // the open wallet credit and deletes the row through the same cascade the UI
    // uses, so commissions and instructor earnings are recomputed correctly.
    await applyDiscount(client, {
      customerId: d.customer_id,
      entityType: 'booking',
      entityId: d.booking_id,
      percent: null,
      amountOverride: 0,
      reason: 'Regrouped: group discount re-split per participant',
      createdBy: d.created_by,
    });
    touched.add(`${d.customer_id}|${d.currency || 'EUR'}`);

    for (let i = 0; i < participants.length; i += 1) {
      if (perCents[i] <= 0) continue;
      await applyDiscount(client, {
        customerId: participants[i].user_id,
        entityType: 'booking',
        entityId: d.booking_id,
        percent: null,
        amountOverride: perCents[i] / 100,
        participantUserId: participants[i].user_id,
        reason: d.reason || 'Discount applied at booking creation',
        createdBy: d.created_by,
      });
      touched.add(`${participants[i].user_id}|${d.currency || 'EUR'}`);
    }
  }
  return bad.length;
}

async function main() {
  console.log(APPLY ? '*** APPLY MODE — writing changes ***' : '--- DRY RUN (pass --apply to write) ---');
  const client = await pool.connect();
  const touched = new Set();
  try {
    if (APPLY) await client.query('BEGIN');
    const part1 = await repairDeletedBookingCredits(client, touched);
    const part2 = await repairGroupDiscounts(client, touched);
    if (APPLY) await client.query('COMMIT');

    if (APPLY && touched.size) {
      console.log(`\n=== Recomputing ${touched.size} wallet(s) from the ledger ===`);
      for (const key of touched) {
        const [userId, currency] = key.split('|');
        const balance = await recomputeBalanceFromLedger(userId, currency);
        console.log(`  ${userId} ${currency} → ${fmt(balance?.available ?? balance, currency)}`);
      }
    }

    console.log(
      `\nDone. Deleted-booking phantoms: ${part1}. Group discounts re-split: ${part2}.` +
      (APPLY ? '' : '\nNothing was written — re-run with --apply.')
    );
  } catch (err) {
    if (APPLY) {
      try { await client.query('ROLLBACK'); } catch { /* already settled */ }
    }
    console.error('Repair failed, nothing committed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
