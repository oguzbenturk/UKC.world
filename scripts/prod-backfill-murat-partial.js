#!/usr/bin/env node
// One-off: backfill the missing wallet charge for Murat Gül's partial-package booking
// f24fcfa1-5c0c-419d-9bdc-3c0894c4647d (2026-05-25 17:00, 2h Private Kitesurfing Lesson,
// 1h from package + 1h cash @ €95/h = €95). The booking flow had a bug that wrote the
// €95 to bookings.final_amount but never inserted the corresponding wallet_transactions
// row, so Murat's balance is €95 too high.
import fs from 'fs';
import { NodeSSH } from 'node-ssh';

const secrets = JSON.parse(fs.readFileSync('.deploy.secrets.json', 'utf8'));
const ssh = new NodeSSH();

const MURAT_ID = '3c00c054-124c-4faf-8305-f0982044827a';
const BOOKING_ID = 'f24fcfa1-5c0c-419d-9bdc-3c0894c4647d';
const CASH_AMOUNT = 95;

async function runPsql(label, sql) {
  const cmd = `docker exec -i plannivo_db_1 psql -U plannivo -d plannivo -v ON_ERROR_STOP=1 -c "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
  const r = await ssh.execCommand(cmd);
  if (r.stderr && r.stderr.trim()) console.error(`[${label}] STDERR:`, r.stderr);
  console.log(`\n=== ${label} ===`);
  console.log(r.stdout);
  if (r.code !== 0) throw new Error(`${label} failed with code ${r.code}`);
}

await ssh.connect({ host: secrets.host, username: secrets.user, password: secrets.password });

// 1. Verify BEFORE state
await runPsql('BEFORE: Murat wallet balance', `
  SELECT id, currency, available_amount, pending_amount, non_withdrawable_amount, updated_at
  FROM wallet_balances WHERE user_id = '${MURAT_ID}' AND currency = 'EUR';
`);

await runPsql('BEFORE: Murat wallet transactions', `
  SELECT transaction_type, direction, amount, available_delta, balance_available_after, description, booking_id, transaction_date
  FROM wallet_transactions WHERE user_id = '${MURAT_ID}' ORDER BY transaction_date;
`);

await runPsql('BEFORE: booking row', `
  SELECT id, date, start_hour, duration, amount, final_amount, payment_status, customer_package_id
  FROM bookings WHERE id = '${BOOKING_ID}';
`);

await runPsql('BEFORE: existing charge for this booking?', `
  SELECT count(*) AS existing_charges
  FROM wallet_transactions
  WHERE booking_id = '${BOOKING_ID}' AND transaction_type = 'booking_charge' AND direction = 'debit';
`);

// 2. Apply the backfill in a single transaction
const backfillSql = `
BEGIN;
DO $$
DECLARE
  v_balance_id uuid;
  v_available numeric;
  v_pending numeric;
  v_non_withdrawable numeric;
  v_new_available numeric;
  v_existing int;
BEGIN
  -- Guard: don't double-insert
  SELECT count(*) INTO v_existing FROM wallet_transactions
    WHERE booking_id = '${BOOKING_ID}'::uuid
      AND transaction_type = 'booking_charge'
      AND direction = 'debit';
  IF v_existing > 0 THEN
    RAISE EXCEPTION 'Wallet charge already exists for booking ${BOOKING_ID} (count=%)', v_existing;
  END IF;

  -- Allow negative balance for this session
  PERFORM set_config('wallet.allow_negative', 'true', false);

  SELECT id, available_amount, pending_amount, non_withdrawable_amount
    INTO v_balance_id, v_available, v_pending, v_non_withdrawable
  FROM wallet_balances
  WHERE user_id = '${MURAT_ID}'::uuid AND currency = 'EUR'
  FOR UPDATE;

  IF v_balance_id IS NULL THEN
    RAISE EXCEPTION 'No EUR wallet balance row found for user ${MURAT_ID}';
  END IF;

  v_new_available := v_available - ${CASH_AMOUNT};

  UPDATE wallet_balances
  SET available_amount = v_new_available,
      last_transaction_at = NOW(),
      updated_at = NOW()
  WHERE id = v_balance_id;

  INSERT INTO wallet_transactions (
    user_id, balance_id, transaction_type, status, direction, currency,
    amount, available_delta, pending_delta, non_withdrawable_delta,
    balance_available_after, balance_pending_after, balance_non_withdrawable_after,
    description, booking_id, related_entity_type, related_entity_id,
    metadata, transaction_date
  ) VALUES (
    '${MURAT_ID}'::uuid,
    v_balance_id,
    'booking_charge',
    'completed',
    'debit',
    'EUR',
    -${CASH_AMOUNT},
    -${CASH_AMOUNT},
    0,
    0,
    v_new_available,
    v_pending,
    v_non_withdrawable,
    'Partial lesson cash leg (1h): 2026-05-25 17:00 (2h total) — backfill 2026-05-26',
    '${BOOKING_ID}'::uuid,
    'booking',
    '${BOOKING_ID}'::uuid,
    jsonb_build_object(
      'source', 'backfill_partial_cash_leg',
      'cashHours', 1,
      'packageHours', 1,
      'bookingDate', '2026-05-25',
      'startHour', '17:00',
      'durationHours', 2,
      'reason', 'code bug: partial-package wallet charge was not inserted at booking creation time'
    ),
    NOW()
  );
END $$;
COMMIT;
`;

const writeCmd = `docker exec -i plannivo_db_1 psql -U plannivo -d plannivo -v ON_ERROR_STOP=1 <<'SQLEOF'
${backfillSql}
SQLEOF`;

console.log('\n=== Applying backfill ===');
const w = await ssh.execCommand(writeCmd);
console.log(w.stdout);
if (w.stderr && w.stderr.trim()) console.error('STDERR:', w.stderr);
if (w.code !== 0) {
  console.error('BACKFILL FAILED with code', w.code);
  ssh.dispose();
  process.exit(1);
}

// 3. Verify AFTER state
await runPsql('AFTER: Murat wallet balance', `
  SELECT id, currency, available_amount, pending_amount, non_withdrawable_amount, updated_at
  FROM wallet_balances WHERE user_id = '${MURAT_ID}' AND currency = 'EUR';
`);

await runPsql('AFTER: Murat wallet transactions', `
  SELECT transaction_type, direction, amount, available_delta, balance_available_after, description, booking_id, transaction_date
  FROM wallet_transactions WHERE user_id = '${MURAT_ID}' ORDER BY transaction_date;
`);

ssh.dispose();
console.log('\n✅ Backfill complete.');
