// One-shot data fix for the two staff-payout ledger diseases found on
// 2026-07-22 while unifying the /instructors balance column with the
// manager profile payroll (Oğuzhan Bentürk: list showed +719, profile −200):
//
// A) CHANNEL DUPLICATES — the Instructors-list Pay button used to record
//    manager staff into the INSTRUCTOR payroll channel while the profile
//    panel records to the MANAGER channel. Oğuzhan's real transfers live in
//    the manager channel; the two instructor-channel rows are double-entries
//    of the same money (737 ↔ 736 "emir önal" same-day pair, and the 465
//    row — profile summary −200, which the owner confirms correct, has never
//    counted either). → cancel them (status='cancelled' + metadata), the
//    same soft-cancel deleteStaffPayment performs.
//
// B) WALLET LEAK — recordLegacyTransaction silently DROPPED the
//    availableDelta field (fixed in walletService.js the same day), so every
//    staff payout/deduction since May 2026 wrote ±amount into the staff
//    member's personal wallet instead of 0. ~€15.9k phantom credit across 7
//    staff. → zero available_delta on all instructor_payment /
//    manager_payment payout rows, then recompute wallet_balances from the
//    completed ledger (allow_negative: a staff member who SPENT phantom
//    credit may legitimately land negative).
//
// Idempotent: a second run finds nothing to cancel / zero and the recompute
// is a no-op. Aborts if the instructor-channel rows found for the manager
// differ from the expected duplicate set (investigate before cancelling).
//
// Usage (runs against whatever backend/.env points to):
//   node backend/scripts/repair-staff-payout-wallet-leak.mjs

import { pool } from '../db.js';
import { recomputeBalanceFromLedger } from '../services/walletService.js';

const MANAGER_EMAIL = 'ozibenturk@gmail.com';
// The known mis-channeled rows (ids are stable across dev/prod — dev is a
// synced prod copy). Any OTHER completed instructor-channel row for the
// manager aborts the run: it would be new money we haven't audited.
const EXPECTED_DUPLICATES = [
  { id: '1a81e85c-8174-4796-9cca-0eee423e8359', amount: 465 },
  { id: '763cac4b-94b6-4d4e-8367-bf61f9bf762a', amount: 737 },
];

const fmt = (v) => Number(v).toFixed(2);
let exitCode = 0;
const client = await pool.connect();

try {
  await client.query('BEGIN');
  // wallet_balances may legitimately go negative after the leak is removed
  // (phantom credit that was already spent). Session-local guard override,
  // same as staffPaymentService.resyncWalletAfterCancel.
  await client.query(`SELECT set_config('wallet.allow_negative', 'true', false)`);

  const { rows: [manager] } = await client.query(
    `SELECT u.id, u.name, r.name AS role
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
      WHERE LOWER(u.email) = LOWER($1) AND u.deleted_at IS NULL`,
    [MANAGER_EMAIL]
  );
  if (!manager) throw new Error(`Manager user ${MANAGER_EMAIL} not found`);
  if (manager.role !== 'manager') {
    throw new Error(`${MANAGER_EMAIL} role is '${manager.role}', expected 'manager' — aborting`);
  }

  // ── Part A: cancel the manager's instructor-channel duplicates ────────────
  const { rows: strayRows } = await client.query(
    `SELECT id, amount, description, created_at
       FROM wallet_transactions
      WHERE user_id = $1
        AND entity_type = 'instructor_payment'
        AND transaction_type IN ('payment', 'deduction')
        AND status = 'completed'
      ORDER BY created_at`,
    [manager.id]
  );

  const expectedIds = new Set(EXPECTED_DUPLICATES.map((d) => d.id));
  const unexpected = strayRows.filter((r) => !expectedIds.has(r.id));
  if (unexpected.length > 0) {
    console.error('Unexpected completed instructor-channel rows for the manager — NOT cancelling, audit first:');
    for (const r of unexpected) {
      console.error(`  ${r.id}  ${fmt(r.amount)}  ${r.created_at.toISOString().slice(0, 10)}  ${r.description}`);
    }
    throw new Error('Aborted: unexpected instructor-channel rows (see above)');
  }

  for (const row of strayRows) {
    const expected = EXPECTED_DUPLICATES.find((d) => d.id === row.id);
    if (Math.abs(Number(row.amount) - expected.amount) > 0.005) {
      throw new Error(`Row ${row.id} amount ${fmt(row.amount)} ≠ expected ${fmt(expected.amount)} — aborting`);
    }
    await client.query(
      `UPDATE wallet_transactions
          SET status = 'cancelled',
              metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
              updated_at = NOW()
        WHERE id = $1`,
      [row.id, JSON.stringify({
        cancelledAt: new Date().toISOString(),
        cancelledBy: null,
        cancellationOrigin: 'scripts:repair-staff-payout-wallet-leak',
        reason: 'Duplicate channel entry — this transfer is recorded in the manager_payment ledger; the Instructors-list Pay button mis-routed it to the instructor channel.',
      })]
    );
    console.log(`A: cancelled instructor-channel duplicate ${row.id} (${fmt(row.amount)} — "${row.description}")`);
  }
  if (strayRows.length === 0) console.log('A: nothing to cancel (already repaired)');

  // ── Part B: zero the leaked wallet deltas on all staff payout rows ────────
  const { rows: leaked } = await client.query(
    `UPDATE wallet_transactions
        SET available_delta = 0,
            metadata = COALESCE(metadata, '{}'::jsonb)
              || jsonb_build_object(
                   'leakRepairedAt', NOW(),
                   'leakRepairedDelta', available_delta,
                   'leakRepairOrigin', 'scripts:repair-staff-payout-wallet-leak'),
            updated_at = NOW()
      WHERE entity_type IN ('instructor_payment', 'manager_payment')
        AND transaction_type IN ('payment', 'deduction')
        AND available_delta != 0
      RETURNING user_id, currency, status, available_delta`,
    []
  );
  console.log(`B: zeroed available_delta on ${leaked.length} staff payout row(s)`);

  // ── Recompute wallet caches for every touched (user, currency) ────────────
  const pairs = new Map();
  for (const r of leaked) pairs.set(`${r.user_id}|${r.currency || 'EUR'}`, { userId: r.user_id, currency: r.currency || 'EUR' });
  // Part A rows had their deltas zeroed by Part B (or were zero already), but
  // include the manager unconditionally so a re-run still verifies his wallet.
  pairs.set(`${manager.id}|EUR`, { userId: manager.id, currency: 'EUR' });

  for (const { userId, currency } of pairs.values()) {
    const { rows: [before] } = await client.query(
      `SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2`,
      [userId, currency]
    );
    const after = await recomputeBalanceFromLedger(userId, currency, { client });
    const { rows: [who] } = await client.query(`SELECT name FROM users WHERE id = $1`, [userId]);
    console.log(`   wallet ${who?.name ?? userId} [${currency}]: ${fmt(before?.available_amount ?? 0)} → ${fmt(after.available)}`);
  }

  await client.query('COMMIT');
  console.log('Done.');
} catch (err) {
  try { await client.query('ROLLBACK'); } catch { /* already settled */ }
  console.error('FAILED (rolled back):', err.message);
  exitCode = 1;
} finally {
  client.release();
  await pool.end();
  process.exit(exitCode);
}
