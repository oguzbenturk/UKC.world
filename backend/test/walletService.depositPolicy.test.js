import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, test } from '@jest/globals';

import { pool } from '../db.js';
import {
  createDepositRequest,
  initiateBinancePayDeposit,
  saveWalletSettings
} from '../services/walletService.js';

const TEST_CURRENCY = 'EUR';
const createdUsers = new Set();

async function createTestUser(userId) {
  // Get a student role_id first
  const roleResult = await pool.query(
    `SELECT id FROM roles WHERE name = 'student' LIMIT 1`
  );
  const roleId = roleResult.rows[0]?.id || null;

  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'test-hash', $4, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [userId, 'Test User', `test-${userId.slice(0, 8)}@test.local`, roleId]
  );
}

async function cleanupUserData(userId) {
  await pool.query('DELETE FROM wallet_audit_logs WHERE wallet_user_id = $1', [userId]);
  await pool.query('DELETE FROM wallet_deposit_requests WHERE user_id = $1', [userId]);
  await pool.query(
    'DELETE FROM wallet_settings WHERE scope_type = $1 AND scope_id = $2 AND currency = $3',
    ['user', userId, TEST_CURRENCY]
  );
  // Note: We don't delete the user to avoid cascade issues; users are cleaned up naturally
}

afterEach(async () => {
  for (const userId of createdUsers) {
    await cleanupUserData(userId);
  }
  createdUsers.clear();
});

describe('walletService deposit policy', () => {
  test('rejects deposits exceeding per-transaction limit when unlimited disabled', async () => {
    const userId = randomUUID();
    createdUsers.add(userId);

    await saveWalletSettings({
      scopeType: 'user',
      scopeId: userId,
      currency: TEST_CURRENCY,
      settings: {
        preferences: {
          depositPolicy: {
            allowUnlimitedDeposits: false,
            maxPerTransaction: 50
          }
        }
      }
    });

    await expect(
      createDepositRequest({ userId, amount: 75, currency: TEST_CURRENCY, method: 'card' })
    ).rejects.toThrow('per-transaction limit');
  });

  test('allows large deposit when unlimited configuration is enabled', async () => {
    const userId = randomUUID();
    createdUsers.add(userId);
    await createTestUser(userId);

    const result = await createDepositRequest({
      userId,
      amount: 750,
      currency: TEST_CURRENCY,
      method: 'card'
    });

    expect(result.deposit).toBeDefined();
    expect(result.deposit.amount).toBeCloseTo(750, 4);
  });

  test('rejects binance pay deposits when gateway disabled in settings', async () => {
    const userId = randomUUID();
    createdUsers.add(userId);

    await saveWalletSettings({
      scopeType: 'user',
      scopeId: userId,
      currency: TEST_CURRENCY,
      settings: {
        enabledGateways: ['stripe', 'iyzico'],
        preferences: {
          depositPolicy: {
            allowUnlimitedDeposits: true
          }
        }
      }
    });

    await expect(
      initiateBinancePayDeposit({ userId, amount: 100, currency: TEST_CURRENCY })
    ).rejects.toThrow('disabled for deposits');
  });
});
