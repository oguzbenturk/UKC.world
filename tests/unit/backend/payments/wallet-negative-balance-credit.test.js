// Regression: a CREDIT (refund) to a wallet whose available balance is already
// negative must succeed even if the result is still negative. Before the fix the
// insufficient-balance guard in recordTransaction rejected ANY row whose
// resulting balance was < 0, so e.g. PATCH /rentals/:id/cancel and
// POST /finances/accounts/:id/process-refund 500'd with
// "Insufficient wallet balance" for customers who owed money (−650 + 460 = −190).
// The guard must only reject a row that moves the balance DOWN below zero.

import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, test } from '@jest/globals';

import { pool } from '../../../../backend/db.js';
import {
  recordTransaction,
  recordLegacyTransaction,
  getBalance,
} from '../../../../backend/services/walletService.js';

const CUR = 'EUR';
const createdUsers = new Set();

async function createTestUser() {
  const userId = randomUUID();
  const roleResult = await pool.query(`SELECT id FROM roles WHERE name = 'student' LIMIT 1`);
  const roleId = roleResult.rows[0]?.id || null;
  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'test-hash', $4, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [userId, 'WNB Test', `wnb-${userId.slice(0, 8)}@test.com`, roleId]
  );
  createdUsers.add(userId);
  return userId;
}

// Put the wallet into debt the way production does: a pay-later charge written
// with allowNegative (ledger + cache stay consistent).
async function seedDebt(userId, amount, extra = {}) {
  await recordTransaction({
    userId,
    amount: -amount,
    transactionType: 'booking_charge',
    currency: CUR,
    allowNegative: true,
    ...extra,
  });
}

async function countOverrideAudits(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM wallet_audit_logs
      WHERE wallet_user_id = $1 AND action = 'wallet.negative_balance_override'`,
    [userId]
  );
  return rows[0].n;
}

afterEach(async () => {
  for (const userId of createdUsers) {
    await pool.query('DELETE FROM wallet_transactions WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM wallet_audit_logs WHERE wallet_user_id = $1', [userId]);
    await pool.query('DELETE FROM wallet_balances WHERE user_id = $1', [userId]);
  }
  createdUsers.clear();
});

describe('recordTransaction on a negative wallet', () => {
  test('a refund credit succeeds and moves the balance toward zero (−650 + 460 = −190)', async () => {
    const userId = await createTestUser();
    await seedDebt(userId, 650);
    expect((await getBalance(userId, CUR)).available).toBe(-650);

    // Same call shape as PATCH /rentals/:id/cancel (no allowNegative).
    const tx = await recordLegacyTransaction({
      userId,
      amount: 460,
      transactionType: 'rental_cancelled_refund',
      status: 'completed',
      direction: 'credit',
      currency: CUR,
      description: 'regression: refund on negative wallet',
    });

    expect(Number(tx.available_delta)).toBe(460);
    expect(Number(tx.balance_available_after)).toBe(-190);
    expect((await getBalance(userId, CUR)).available).toBe(-190);

    // Cache still equals the completed ledger.
    const { rows: ledger } = await pool.query(
      `SELECT COALESCE(SUM(available_delta), 0)::numeric AS s FROM wallet_transactions
        WHERE user_id = $1 AND currency = $2 AND status = 'completed'`,
      [userId, CUR]
    );
    expect(Number(ledger[0].s)).toBe(-190);

    // Not an explicit override → no negative_balance_override audit row for the credit
    // (the seeding debit wrote exactly one).
    expect(await countOverrideAudits(userId)).toBe(1);
  });

  test('a zero-delta row on a negative wallet succeeds (balance unchanged)', async () => {
    const userId = await createTestUser();
    await seedDebt(userId, 100);

    await recordTransaction({
      userId,
      amount: 0,
      availableDelta: 0,
      transactionType: 'cash_payment',
      direction: 'credit',
      currency: CUR,
    });
    expect((await getBalance(userId, CUR)).available).toBe(-100);
  });

  test('a credit is not blocked by an overdraft floor the wallet is already beyond', async () => {
    const userId = await createTestUser();
    await seedDebt(userId, 650);
    // Floor configured after the debt already exceeded it.
    // (the DB guard trigger re-checks the negative row on any UPDATE, so authorize it locally)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('wallet.allow_negative', 'true', true)");
      await client.query(
        `UPDATE wallet_balances SET overdraft_limit = 100 WHERE user_id = $1 AND currency = $2`,
        [userId, CUR]
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    await recordTransaction({ userId, amount: 460, transactionType: 'payment_refund', currency: CUR });
    expect((await getBalance(userId, CUR)).available).toBe(-190);

    // ...but a further debit is still rejected by the floor.
    await expect(
      recordTransaction({ userId, amount: -10, transactionType: 'booking_charge', currency: CUR, allowNegative: true })
    ).rejects.toThrow(/Overdraft limit/i);
    expect((await getBalance(userId, CUR)).available).toBe(-190);
  });

  test('a debit on a negative wallet without allowNegative still throws', async () => {
    const userId = await createTestUser();
    await seedDebt(userId, 650);

    await expect(
      recordTransaction({ userId, amount: -10, transactionType: 'booking_charge', currency: CUR })
    ).rejects.toThrow(/Insufficient wallet balance/i);
    expect((await getBalance(userId, CUR)).available).toBe(-650);
  });
});

describe('recordTransaction on a positive wallet', () => {
  test('a debit beyond the balance without allowNegative still throws', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 100, transactionType: 'deposit', currency: CUR });

    await expect(
      recordTransaction({ userId, amount: -150, transactionType: 'booking_charge', currency: CUR })
    ).rejects.toThrow(/Insufficient wallet balance/i);
    expect((await getBalance(userId, CUR)).available).toBe(100);
  });

  test('a debit within the balance still succeeds', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 100, transactionType: 'deposit', currency: CUR });
    await recordTransaction({ userId, amount: -60, transactionType: 'booking_charge', currency: CUR });
    expect((await getBalance(userId, CUR)).available).toBe(40);
  });
});
