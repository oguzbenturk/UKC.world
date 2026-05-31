// Wave 2 — critical (P0) wallet fixes:
//   1. Webhook signature verification (forged webhook can no longer credit a wallet)
//   2. Deposit auto-complete authz (no free self-top-up via manual/crypto)
//   3. Kai/agent booking charge routed through recordTransaction (proper ledger)
//   4. Iyzico callback double-debit prevented via idempotency keys
// Imports are limited to sharp-free modules (no server.js) so the suite loads.

import { randomUUID, createHmac } from 'node:crypto';
import { afterEach, describe, expect, test } from '@jest/globals';

import { pool } from '../../../../backend/db.js';
import { verifyWebhookSignature } from '../../../../backend/services/paymentGatewayWebhookService.js';
import {
  recordTransaction,
  createDepositRequest,
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
    [userId, 'WL2 Test', `wl2-${userId.slice(0, 8)}@test.com`, roleId]
  );
  createdUsers.add(userId);
  return userId;
}

afterEach(async () => {
  for (const userId of createdUsers) {
    await pool.query('DELETE FROM wallet_transactions WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM wallet_deposit_requests WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM wallet_audit_logs WHERE wallet_user_id = $1', [userId]);
    await pool.query('DELETE FROM wallet_balances WHERE user_id = $1', [userId]);
  }
  createdUsers.clear();
  delete process.env.PAYTR_MERCHANT_KEY;
  delete process.env.PAYTR_MERCHANT_SALT;
  delete process.env.BINANCE_PAY_SECRET;
  delete process.env.IYZICO_WEBHOOK_SECRET;
});

// ── 1. Webhook signature verification ──────────────────────────────────────────
describe('verifyWebhookSignature', () => {
  test('PayTR: valid hash passes, tampered hash is rejected', () => {
    process.env.PAYTR_MERCHANT_KEY = 'mkey';
    process.env.PAYTR_MERCHANT_SALT = 'msalt';
    const body = { merchant_oid: 'ORD123', status: 'success', total_amount: '10000' };
    const hash = createHmac('sha256', 'mkey')
      .update(`${body.merchant_oid}msalt${body.status}${body.total_amount}`)
      .digest('base64');

    expect(() => verifyWebhookSignature('paytr', { payload: { ...body, hash } })).not.toThrow();
    expect(() => verifyWebhookSignature('paytr', { payload: { ...body, hash: 'forged' } })).toThrow(/signature/i);
  });

  test('Binance Pay: valid HMAC-SHA512 header passes, wrong rejected', () => {
    process.env.BINANCE_PAY_SECRET = 'bsecret';
    const raw = JSON.stringify({ bizStatus: 'PAY_SUCCESS' });
    const ts = '1700000000000';
    const nonce = 'abc123';
    const sig = createHmac('sha512', 'bsecret').update(`${ts}\n${nonce}\n${raw}\n`).digest('hex').toUpperCase();
    const headers = { 'binancepay-timestamp': ts, 'binancepay-nonce': nonce, 'binancepay-signature': sig };

    expect(() => verifyWebhookSignature('binance_pay', { headers, rawBody: raw })).not.toThrow();
    expect(() => verifyWebhookSignature('binance_pay', {
      headers: { ...headers, 'binancepay-signature': 'DEADBEEF' }, rawBody: raw,
    })).toThrow(/signature/i);
  });

  test('Iyzico: valid HMAC-SHA256 (hex) header passes, wrong rejected', () => {
    process.env.IYZICO_WEBHOOK_SECRET = 'isecret';
    const raw = JSON.stringify({ status: 'SUCCESS', paymentId: '99' });
    const sig = createHmac('sha256', 'isecret').update(raw).digest('hex');

    expect(() => verifyWebhookSignature('iyzico', { headers: { 'x-iyz-signature-v3': sig }, rawBody: raw })).not.toThrow();
    expect(() => verifyWebhookSignature('iyzico', { headers: { 'x-iyz-signature-v3': 'nope' }, rawBody: raw })).toThrow(/signature/i);
  });

  test('no secret configured → does not throw (warn path, require-flag off)', () => {
    // env secrets cleared in afterEach; ensure none set here
    expect(() => verifyWebhookSignature('iyzico', { headers: {}, rawBody: '{}' })).not.toThrow();
  });
});

// ── 2. Deposit auto-complete authz ─────────────────────────────────────────────
describe('deposit auto-complete authz', () => {
  test('self-service user CANNOT self-complete a manual deposit', async () => {
    const userId = await createTestUser();
    const result = await createDepositRequest({
      userId, amount: 100, currency: CUR, method: 'manual',
      autoComplete: true,            // user-supplied
      allowManualComplete: false,    // route did NOT authorize (non-privileged)
      referenceCode: `dep-${userId}`,
    });
    expect(result.deposit.status).not.toBe('completed');         // stays pending
    expect((await getBalance(userId, CUR)).available).toBe(0);   // wallet NOT credited
  });

  test('privileged actor CAN complete a manual deposit', async () => {
    const userId = await createTestUser();
    const result = await createDepositRequest({
      userId, amount: 100, currency: CUR, method: 'manual',
      autoComplete: true,
      allowManualComplete: true,     // route authorized (admin/manager)
      referenceCode: `dep2-${userId}`,
    });
    expect(result.deposit.status).toBe('completed');
    expect((await getBalance(userId, CUR)).available).toBe(100);
  });
});

// ── 3. Kai/agent booking charge (mirrors the route's recordTransaction call) ────
describe('Kai booking charge → recordTransaction', () => {
  test('writes a proper EUR ledger row (delta + snapshot) and is idempotent', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 100, transactionType: 'deposit', currency: CUR });
    const bookingId = randomUUID();

    const doCharge = () => recordTransaction({
      userId, amount: -30, currency: 'EUR', transactionType: 'booking_charge',
      bookingId, relatedEntityType: 'booking', relatedEntityId: bookingId,
      idempotencyKey: `kai-booking-charge:${bookingId}`,
    });

    await doCharge();
    await doCharge(); // retried n8n/Kai call must NOT double-charge

    const { rows } = await pool.query(
      `SELECT available_delta, balance_available_after, currency
         FROM wallet_transactions
        WHERE idempotency_key = $1`,
      [`kai-booking-charge:${bookingId}`]
    );
    expect(rows.length).toBe(1);                          // single ledger row
    expect(Number(rows[0].available_delta)).toBe(-30);    // NOT 0 (old raw-SQL bug)
    expect(rows[0].balance_available_after).not.toBeNull(); // snapshot present
    expect(rows[0].currency).toBe('EUR');
    expect((await getBalance(userId, CUR)).available).toBe(70);
  });
});

// ── 4. Iyzico callback double-debit prevention (idempotency-key replay) ─────────
describe('shop-order callback idempotency', () => {
  test('duplicate callback with same shop-order key debits only once', async () => {
    const userId = await createTestUser();
    await recordTransaction({ userId, amount: 200, transactionType: 'deposit', currency: CUR });
    const orderId = randomUUID();
    const key = `shop-order-charge:${orderId}:EUR`;

    const deduct = () => recordTransaction({
      userId, amount: -50, currency: 'EUR', transactionType: 'payment', direction: 'debit',
      availableDelta: -50, relatedEntityType: 'shop_order', relatedEntityId: orderId,
      idempotencyKey: key,
    });

    await deduct();
    await deduct(); // duplicate Iyzico callback

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE idempotency_key = $1`,
      [key]
    );
    expect(rows[0].n).toBe(1);
    expect((await getBalance(userId, CUR)).available).toBe(150); // 200 - 50, charged once
  });
});
