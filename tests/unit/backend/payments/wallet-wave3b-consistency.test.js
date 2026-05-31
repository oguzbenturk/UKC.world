// Wave 3b — backend consistency. Validates the two highest-risk SQL changes against
// the real DB: (1) multi-currency report sums normalised to EUR via currency_settings,
// (2) the user-delete wallet archival snapshot (migration 266).

import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, test } from '@jest/globals';

import { pool } from '../../../../backend/db.js';
import { recordTransaction } from '../../../../backend/services/walletService.js';

const createdUsers = new Set();
let tryRate = null;

beforeAll(async () => {
  const { rows } = await pool.query(`SELECT exchange_rate FROM currency_settings WHERE currency_code = 'TRY'`);
  tryRate = parseFloat(rows[0]?.exchange_rate);
});

async function createTestUser() {
  const userId = randomUUID();
  const roleResult = await pool.query(`SELECT id FROM roles WHERE name = 'student' LIMIT 1`);
  const roleId = roleResult.rows[0]?.id || null;
  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'test-hash', $4, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [userId, 'WL3b Test', `wl3b-${userId.slice(0, 8)}@test.com`, roleId]
  );
  createdUsers.add(userId);
  return userId;
}

afterEach(async () => {
  for (const userId of createdUsers) {
    await pool.query('DELETE FROM deleted_user_wallet_archive WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM wallet_transactions WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM wallet_audit_logs WHERE wallet_user_id = $1', [userId]);
    await pool.query('DELETE FROM wallet_balances WHERE user_id = $1', [userId]);
  }
  createdUsers.clear();
});

describe('multi-currency report sums normalised to EUR', () => {
  test('outstanding-balance conversion: EUR + TRY summed in EUR, not face value', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 50, transactionType: 'deposit', currency: 'EUR' });
    const tryAmount = Math.round(tryRate * 20 * 100) / 100; // ~20 EUR worth of TRY
    await recordTransaction({ userId, amount: tryAmount, transactionType: 'deposit', currency: 'TRY' });

    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(wb.available_amount / COALESCE(cs.exchange_rate, 1)), 0) AS eur
         FROM wallet_balances wb
         LEFT JOIN currency_settings cs ON cs.currency_code = wb.currency AND cs.is_active = true
        WHERE wb.user_id = $1`,
      [userId]
    );
    const eur = parseFloat(rows[0].eur);
    expect(eur).toBeGreaterThan(69);   // ≈ 70, NOT 50 + tryAmount (~1121)
    expect(eur).toBeLessThan(71);
  });

  test('revenue conversion: EUR + TRY payments summed in EUR', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 1000, transactionType: 'deposit', currency: 'EUR' });
    await recordTransaction({ userId, amount: tryRate * 1000, transactionType: 'deposit', currency: 'TRY' });
    // two payments: 100 EUR and (10 EUR worth of) TRY
    await recordTransaction({ userId, amount: -100, transactionType: 'service_payment', currency: 'EUR' });
    await recordTransaction({ userId, amount: -(tryRate * 10), transactionType: 'service_payment', currency: 'TRY' });

    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(ABS(wt.amount) / COALESCE(cs.exchange_rate, 1)), 0) AS eur
         FROM wallet_transactions wt
         LEFT JOIN currency_settings cs ON cs.currency_code = wt.currency AND cs.is_active = true
        WHERE wt.user_id = $1 AND wt.transaction_type = 'service_payment' AND wt.status = 'completed'`,
      [userId]
    );
    const eur = parseFloat(rows[0].eur);
    expect(eur).toBeGreaterThan(109); // ≈ 110 EUR, NOT 100 + (tryRate*10 ≈ 535)
    expect(eur).toBeLessThan(111);
  });
});

describe('user-delete wallet archival (migration 266)', () => {
  // Runs the exact archival INSERT...SELECT used in routes/users.js before the
  // destructive wallet deletes, then asserts the snapshot captured everything.
  test('snapshots balances, summary and full ledger before deletion', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 100, transactionType: 'deposit', currency: 'EUR' });
    await recordTransaction({ userId, amount: -30, transactionType: 'booking_charge', currency: 'EUR' });

    await pool.query(
      `INSERT INTO deleted_user_wallet_archive (user_id, email, balances, transaction_summary, transactions, archived_by)
       SELECT u.id,
              u.email,
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'currency', wb.currency, 'available', wb.available_amount,
                  'pending', wb.pending_amount, 'non_withdrawable', wb.non_withdrawable_amount))
                FROM wallet_balances wb WHERE wb.user_id = u.id), '[]'::jsonb),
              (SELECT jsonb_build_object(
                  'count', COUNT(*),
                  'sum_available_delta', COALESCE(SUM(available_delta), 0),
                  'sum_credits', COALESCE(SUM(available_delta) FILTER (WHERE available_delta > 0), 0),
                  'sum_debits', COALESCE(SUM(available_delta) FILTER (WHERE available_delta < 0), 0))
                FROM wallet_transactions WHERE user_id = u.id),
              COALESCE((SELECT jsonb_agg(to_jsonb(wt.*) ORDER BY wt.created_at)
                FROM wallet_transactions wt WHERE wt.user_id = u.id), '[]'::jsonb),
              $2
         FROM users u
        WHERE u.id = $1`,
      [userId, null]
    );

    const { rows } = await pool.query(
      `SELECT balances, transaction_summary, jsonb_array_length(transactions) AS tx_count
         FROM deleted_user_wallet_archive WHERE user_id = $1`,
      [userId]
    );
    expect(rows.length).toBe(1);
    const summary = rows[0].transaction_summary;
    expect(Number(summary.count)).toBe(2);
    expect(Number(summary.sum_available_delta)).toBe(70);  // +100 -30
    expect(Number(summary.sum_credits)).toBe(100);
    expect(Number(summary.sum_debits)).toBe(-30);
    expect(Number(rows[0].tx_count)).toBe(2);
    const balances = rows[0].balances;
    expect(balances.find((b) => b.currency === 'EUR')).toBeTruthy();
    expect(Number(balances.find((b) => b.currency === 'EUR').available)).toBe(70);
  });
});
