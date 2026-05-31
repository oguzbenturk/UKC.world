// Wave 3a — refund correctness. Every retrofitted refund site (rentals, bookings
// delete, shop orders, student self-cancel) delegates to getEntityNetCharges +
// idempotency keys, so this suite validates that shared foundation directly:
//   - refunds the ORIGINAL charge currency (not hardcoded EUR)
//   - refunds only the OUTSTANDING portion (nets prior refunds → no double refund)
//   - works across booking_id / rental_id (uuid) and shop order (metadata.orderId)
//   - hybrid: returns only the wallet-charged portion

import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, test } from '@jest/globals';

import { pool } from '../../../../backend/db.js';
import {
  recordTransaction,
  getEntityNetCharges,
  getBalance,
} from '../../../../backend/services/walletService.js';

const createdUsers = new Set();

async function createTestUser() {
  const userId = randomUUID();
  const roleResult = await pool.query(`SELECT id FROM roles WHERE name = 'student' LIMIT 1`);
  const roleId = roleResult.rows[0]?.id || null;
  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'test-hash', $4, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [userId, 'WL3 Test', `wl3-${userId.slice(0, 8)}@test.com`, roleId]
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

describe('getEntityNetCharges', () => {
  test('returns the outstanding charge per currency; nets prior refunds to zero', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 100, transactionType: 'deposit', currency: 'EUR' });
    const bookingId = randomUUID();

    await recordTransaction({
      userId, amount: -30, currency: 'EUR', transactionType: 'booking_charge',
      bookingId, relatedEntityType: 'booking', relatedEntityId: bookingId,
    });

    let net = await getEntityNetCharges({ bookingId });
    expect(net).toEqual([{ currency: 'EUR', amount: 30 }]);

    // refund it
    await recordTransaction({
      userId, amount: 30, currency: 'EUR', transactionType: 'booking_cancelled_refund',
      bookingId, relatedEntityType: 'booking', relatedEntityId: bookingId,
    });
    net = await getEntityNetCharges({ bookingId });
    expect(net).toEqual([]); // fully refunded → nothing outstanding (double-refund safe)
  });

  test('partial refund leaves the remainder outstanding', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 100, transactionType: 'deposit', currency: 'EUR' });
    const bookingId = randomUUID();
    await recordTransaction({ userId, amount: -50, currency: 'EUR', transactionType: 'booking_charge', bookingId });
    await recordTransaction({ userId, amount: 20, currency: 'EUR', transactionType: 'booking_cancelled_refund', bookingId });
    expect(await getEntityNetCharges({ bookingId })).toEqual([{ currency: 'EUR', amount: 30 }]);
  });

  test('rental charged in TRY refunds in TRY, not EUR (currency symmetry)', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 1000, transactionType: 'deposit', currency: 'TRY' });
    const rentalId = randomUUID();
    await recordTransaction({
      userId, amount: -750, currency: 'TRY', transactionType: 'rental_charge',
      rentalId, relatedEntityType: 'rental', relatedEntityId: rentalId,
    });

    const net = await getEntityNetCharges({ rentalId });
    expect(net).toEqual([{ currency: 'TRY', amount: 750 }]);

    // Apply the refund the route would now make (in the charge currency).
    for (const rc of net) {
      await recordTransaction({
        userId, amount: rc.amount, currency: rc.currency, transactionType: 'rental_cancelled_refund',
        rentalId, relatedEntityType: 'rental', relatedEntityId: rentalId,
        idempotencyKey: `rental-refund:${rentalId}:${rc.currency}`,
      });
    }
    expect((await getBalance(userId, 'TRY')).available).toBe(1000); // TRY restored
    expect((await getBalance(userId, 'EUR')).available).toBe(0);    // EUR untouched
  });

  test('hybrid: returns only the wallet-charged portion', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 100, transactionType: 'deposit', currency: 'EUR' });
    const bookingId = randomUUID();
    // total booking 80; wallet paid 30, card paid 50 (card never touches the wallet ledger)
    await recordTransaction({ userId, amount: -30, currency: 'EUR', transactionType: 'booking_charge', bookingId });
    expect(await getEntityNetCharges({ bookingId })).toEqual([{ currency: 'EUR', amount: 30 }]); // not 80
  });

  test('shop order matched via metadata.orderId; refund nets out', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 500, transactionType: 'deposit', currency: 'EUR' });
    const orderId = 987654; // INTEGER id
    await recordTransaction({
      userId, amount: -120, currency: 'EUR', transactionType: 'payment', direction: 'debit',
      availableDelta: -120, relatedEntityType: 'shop_order', metadata: { orderId },
    });
    expect(await getEntityNetCharges({ shopOrderId: orderId })).toEqual([{ currency: 'EUR', amount: 120 }]);

    await recordTransaction({
      userId, amount: 120, currency: 'EUR', transactionType: 'refund', direction: 'credit',
      availableDelta: 120, relatedEntityType: 'shop_order_refund', metadata: { orderId },
    });
    expect(await getEntityNetCharges({ shopOrderId: orderId })).toEqual([]);
  });
});

describe('refund idempotency (retried cancel cannot double-refund)', () => {
  test('same refund idempotencyKey credits once', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 100, transactionType: 'deposit', currency: 'EUR' });
    const rentalId = randomUUID();
    await recordTransaction({ userId, amount: -40, currency: 'EUR', transactionType: 'rental_charge', rentalId });

    const refund = () => recordTransaction({
      userId, amount: 40, currency: 'EUR', transactionType: 'rental_cancelled_refund',
      rentalId, idempotencyKey: `rental-refund:${rentalId}:EUR`,
    });
    await refund();
    await refund(); // retried cancel

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE idempotency_key = $1`,
      [`rental-refund:${rentalId}:EUR`]
    );
    expect(rows[0].n).toBe(1);
    expect((await getBalance(userId, 'EUR')).available).toBe(100); // 100 -40 +40, refunded once
  });
});
