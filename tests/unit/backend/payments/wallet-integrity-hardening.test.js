// Wave 1 — wallet core integrity hardening (migration 265 + walletService changes).
// Covers: Decimal/NaN money handling, recordTransaction idempotency, per-wallet
// overdraft floor, transaction-local overdraft guard (no session leak), the
// INSERT-time non-negative trigger, and ledger↔cache reconciliation helpers.

import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, test } from '@jest/globals';

import { pool } from '../../../../backend/db.js';
import {
  recordTransaction,
  getBalance,
  recomputeBalanceFromLedger,
  findBalanceLedgerDrift,
  __testables,
} from '../../../../backend/services/walletService.js';

const { toNumeric, sumMoney } = __testables;
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
    [userId, 'WL Test', `wl-${userId.slice(0, 8)}@test.com`, roleId]
  );
  createdUsers.add(userId);
  return userId;
}

async function seedBalance(userId, { available = 0, overdraftLimit = null } = {}) {
  await pool.query(
    `INSERT INTO wallet_balances (user_id, currency, available_amount, overdraft_limit)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, currency)
     DO UPDATE SET available_amount = EXCLUDED.available_amount, overdraft_limit = EXCLUDED.overdraft_limit`,
    [userId, CUR, available, overdraftLimit]
  );
}

async function countByKey(key) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE idempotency_key = $1`,
    [key]
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

describe('toNumeric / sumMoney (Decimal money handling)', () => {
  test('treats null/undefined/"" as 0', () => {
    expect(toNumeric(null)).toBe(0);
    expect(toNumeric(undefined)).toBe(0);
    expect(toNumeric('')).toBe(0);
  });

  test('quantizes to 4dp with half-up rounding', () => {
    expect(toNumeric('10.12345')).toBe(10.1235);
    expect(toNumeric('99.99994')).toBe(99.9999);
  });

  test('throws on a present non-numeric / non-finite value (no silent 0)', () => {
    expect(() => toNumeric('abc')).toThrow();
    expect(() => toNumeric(NaN)).toThrow();
    expect(() => toNumeric(Infinity)).toThrow();
  });

  test('sumMoney is exact (no float drift)', () => {
    expect(sumMoney(0.1, 0.2)).toBe(0.3); // 0.1 + 0.2 !== 0.3 in float
    expect(sumMoney(100, -0.0001)).toBe(99.9999);
    expect(sumMoney(0.1, 0.2, 0.3, -0.6)).toBe(0);
  });
});

describe('recordTransaction idempotency', () => {
  test('same idempotencyKey debits once and replays the original tx', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 100, transactionType: 'deposit', currency: CUR });

    const key = `test-charge:${userId}`;
    const first = await recordTransaction({
      userId, amount: -30, transactionType: 'booking_charge', currency: CUR, idempotencyKey: key,
    });
    const second = await recordTransaction({
      userId, amount: -30, transactionType: 'booking_charge', currency: CUR, idempotencyKey: key,
    });

    expect(second.id).toBe(first.id);          // replayed, not a new row
    expect(await countByKey(key)).toBe(1);     // exactly one ledger row
    expect((await getBalance(userId, CUR)).available).toBe(70); // charged once, not twice
  });

  test('different idempotencyKeys both apply', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 100, transactionType: 'deposit', currency: CUR });
    await recordTransaction({ userId, amount: -30, transactionType: 'booking_charge', currency: CUR, idempotencyKey: `a:${userId}` });
    await recordTransaction({ userId, amount: -30, transactionType: 'booking_charge', currency: CUR, idempotencyKey: `b:${userId}` });
    expect((await getBalance(userId, CUR)).available).toBe(40);
  });
});

describe('Decimal precision end-to-end', () => {
  test('0.1 + 0.2 credited equals exactly 0.3 in the stored balance', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 0.1, transactionType: 'deposit', currency: CUR });
    await recordTransaction({ userId, amount: 0.2, transactionType: 'deposit', currency: CUR });
    expect((await getBalance(userId, CUR)).available).toBe(0.3);
  });

  test('rejects a malformed (NaN) amount instead of writing a 0 tx', async () => {
    const userId = await createTestUser();
    await expect(
      recordTransaction({ userId, amount: NaN, transactionType: 'deposit', currency: CUR })
    ).rejects.toThrow();
    expect((await getBalance(userId, CUR)).available).toBe(0);
  });
});

describe('overdraft floor', () => {
  test('rejects an overdraft beyond the configured limit, allows within it', async () => {
    const userId = await createTestUser();
    await seedBalance(userId, { available: 0, overdraftLimit: 50 });

    // within limit (-40 >= -50) → allowed
    await recordTransaction({ userId, amount: -40, transactionType: 'booking_charge', currency: CUR, allowNegative: true });
    expect((await getBalance(userId, CUR)).available).toBe(-40);

    // beyond limit (-40 -20 = -60 < -50) → rejected
    await expect(
      recordTransaction({ userId, amount: -20, transactionType: 'booking_charge', currency: CUR, allowNegative: true })
    ).rejects.toThrow(/Overdraft limit/i);
    expect((await getBalance(userId, CUR)).available).toBe(-40); // unchanged
  });
});

describe('transaction-local overdraft guard (no pooled-connection leak)', () => {
  test('allow_negative does not persist onto the connection after commit', async () => {
    const userId = await createTestUser();
    const client = await pool.connect();
    try {
      // Tx 1: authorized overdraft on this exact connection (sets the guard flag).
      await client.query('BEGIN');
      await recordTransaction({ userId, amount: -25, transactionType: 'booking_charge', currency: CUR, allowNegative: true, client });
      await client.query('COMMIT');

      // Tx 2: a NON-authorized debit on the SAME connection that would go negative.
      // With is_local=true the flag is gone, so the guard must reject it.
      await client.query('BEGIN');
      await expect(
        recordTransaction({ userId, amount: -25, transactionType: 'booking_charge', currency: CUR, allowNegative: false, client })
      ).rejects.toThrow(/Insufficient/i);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect((await getBalance(userId, CUR)).available).toBe(-25);
  });
});

describe('DB guard trigger fires on INSERT too', () => {
  test('a direct INSERT of a negative balance is rejected', async () => {
    const userId = await createTestUser();
    await expect(
      pool.query(
        `INSERT INTO wallet_balances (user_id, currency, available_amount) VALUES ($1, $2, $3)`,
        [userId, CUR, -10]
      )
    ).rejects.toThrow();
  });
});

describe('ledger ↔ cache reconciliation', () => {
  test('findBalanceLedgerDrift detects injected drift and recompute fixes it', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 100, transactionType: 'deposit', currency: CUR });
    await recordTransaction({ userId, amount: -30, transactionType: 'booking_charge', currency: CUR });
    expect((await getBalance(userId, CUR)).available).toBe(70);

    // Corrupt the cache directly (simulating a raw-SQL writer drifting it).
    await pool.query(
      `UPDATE wallet_balances SET available_amount = 999 WHERE user_id = $1 AND currency = $2`,
      [userId, CUR]
    );

    const drift = (await findBalanceLedgerDrift({ tolerance: 0.01, limit: 1000 }))
      .filter((d) => d.userId === userId);
    expect(drift.length).toBe(1);
    expect(drift[0].cachedAvailable).toBe(999);
    expect(drift[0].ledgerAvailable).toBe(70);

    await recomputeBalanceFromLedger(userId, CUR);
    expect((await getBalance(userId, CUR)).available).toBe(70);
  });
});
