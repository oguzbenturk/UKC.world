// Wave 5 — the standing SSOT guard: the periodic reconciliation service detects when
// a wallet_balances cache row drifts from its completed-ledger SUM and alarms on it
// (read-only — it never silently overwrites). This validates that drift detection.

import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, test } from '@jest/globals';

import { pool } from '../../../../backend/db.js';
import { recordTransaction } from '../../../../backend/services/walletService.js';
import { reconciliationService } from '../../../../backend/services/financialReconciliationService.js';

const createdUsers = new Set();

async function createTestUser() {
  const userId = randomUUID();
  const roleResult = await pool.query(`SELECT id FROM roles WHERE name = 'student' LIMIT 1`);
  const roleId = roleResult.rows[0]?.id || null;
  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'test-hash', $4, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [userId, 'WL5 Test', `wl5-${userId.slice(0, 8)}@test.com`, roleId]
  );
  createdUsers.add(userId);
  return userId;
}

afterEach(async () => {
  for (const userId of createdUsers) {
    await pool.query('DELETE FROM wallet_transactions WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM wallet_audit_logs WHERE wallet_user_id = $1', [userId]);
    await pool.query('DELETE FROM wallet_balances WHERE user_id = $1', [userId]);
  }
  createdUsers.clear();
});

describe('reconciliation wallet ledger↔cache drift check', () => {
  test('an aligned wallet shows no drift; a corrupted cache is detected', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 100, transactionType: 'deposit', currency: 'EUR' });
    await recordTransaction({ userId, amount: -30, transactionType: 'booking_charge', currency: 'EUR' });

    // Aligned (cache 70 == ledger 70): this user must NOT appear in the drift list.
    let drift = await reconciliationService.runWalletLedgerDriftCheck();
    expect(drift.find((d) => d.userId === userId)).toBeUndefined();

    // Corrupt the cache directly, as a rogue raw-SQL writer would.
    await pool.query(
      `UPDATE wallet_balances SET available_amount = 999 WHERE user_id = $1 AND currency = 'EUR'`,
      [userId]
    );

    drift = await reconciliationService.runWalletLedgerDriftCheck();
    const mine = drift.find((d) => d.userId === userId);
    expect(mine).toBeTruthy();
    expect(mine.cachedAvailable).toBe(999);
    expect(mine.ledgerAvailable).toBe(70);
    expect(mine.drift).toBe(929);
  });
});
