// Regression: online card (Iyzico) shop orders were never confirmed.
//
// POST /api/shop-orders writes card / hybrid orders with payment_status 'pending'
// (shop_orders' CHECK has no 'pending_payment'), but the Iyzico callback
// (POST /api/finances/callback/iyzico, server.js) only claimed orders
// `WHERE payment_status = 'pending_payment'` — so a successful card payment never
// marked the order paid, never redeemed its voucher, and the deferred wallet
// portion was debited while the order stayed pending. A declined payment left the
// order pending forever with its stock reserved.
//
// Full flow against the LOCAL dev DB (backend/.env → localhost:5432/plannivo_dev):
// real order creation → callback, with only the gateway (initiateDeposit /
// verifyPayment) and the staff notification dispatcher mocked. Seeds its own
// user / product / voucher and cleans up after itself.

import { randomUUID } from 'node:crypto';
import { jest, afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const initiateDeposit = jest.fn();
const verifyPayment = jest.fn();
const refundPayment = jest.fn();
await jest.unstable_mockModule('../../../../backend/services/paymentGateways/iyzicoGateway.js', () => ({
  __esModule: true,
  initiateDeposit,
  verifyPayment,
  refundPayment,
}));

// No real staff notifications (in-app / Telegram) from a test run.
const dispatchToStaff = jest.fn(async () => ({ sent: 0 }));
const dispatchNotification = jest.fn(async () => ({ sent: 0 }));
await jest.unstable_mockModule('../../../../backend/services/notificationDispatcherUnified.js', () => ({
  __esModule: true,
  dispatchNotification,
  dispatchToStaff,
  clearPreferenceCache: jest.fn(),
  NOTIFICATION_TYPES: {},
  PREFERENCE_MAP: {},
  default: { dispatchNotification, dispatchToStaff, clearPreferenceCache: jest.fn() },
}));

const { default: app } = await import('../../../../backend/server.js');
const { pool } = await import('../../../../backend/db.js');
const { recordTransaction } = await import('../../../../backend/services/walletService.js');

jest.setTimeout(30000);

const JWT_SECRET = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
const CALLBACK = '/api/finances/callback/iyzico';
const INITIAL_STOCK = 5;

const seed = { userId: null, productId: null, voucherId: null, voucherCode: null, orderIds: [] };
let authToken;
let tokenSeq = 0;

const nextGatewayToken = () => `tok-shopcb-${seed.userId.slice(0, 8)}-${++tokenSeq}-${Date.now()}`;

async function createCardOrder() {
  const gatewayToken = nextGatewayToken();
  initiateDeposit.mockResolvedValueOnce({
    gatewayTransactionId: gatewayToken,
    paymentPageUrl: 'https://sandbox.iyzipay.test/pay',
  });
  const res = await request(app)
    .post('/api/shop-orders')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      items: [{ product_id: seed.productId, quantity: 2 }],
      payment_method: 'credit_card',
      voucher_code: seed.voucherCode,
    });
  if (res.status !== 201) throw new Error(`order create ${res.status}: ${JSON.stringify(res.body)}`);
  expect(res.body.paymentPageUrl).toBeTruthy();
  seed.orderIds.push(res.body.order.id);
  return { orderId: res.body.order.id, orderNumber: res.body.order.order_number, gatewayToken };
}

const getOrder = async (id) =>
  (await pool.query('SELECT * FROM shop_orders WHERE id = $1', [id])).rows[0];
const getStock = async () =>
  (await pool.query('SELECT stock_quantity FROM products WHERE id = $1', [seed.productId])).rows[0].stock_quantity;
const redemptionsFor = async (orderId) => (await pool.query(
  `SELECT * FROM voucher_redemptions
    WHERE voucher_code_id = $1 AND applied_to_type = 'shop' AND metadata->>'orderId' = $2`,
  [seed.voucherId, String(orderId)]
)).rows;
const totalUses = async () =>
  (await pool.query('SELECT total_uses FROM voucher_codes WHERE id = $1', [seed.voucherId])).rows[0].total_uses;
const walletDebitsFor = async (orderId) => (await pool.query(
  `SELECT amount, currency FROM wallet_transactions
    WHERE user_id = $1 AND related_entity_type = 'shop_order' AND metadata->>'orderId' = $2`,
  [seed.userId, String(orderId)]
)).rows;

function postCallback(gatewayToken) {
  return request(app)
    .post(CALLBACK)
    .type('form')
    .send({ token: gatewayToken });
}

beforeAll(async () => {
  seed.userId = randomUUID();
  const tag = seed.userId.slice(0, 8).toUpperCase();
  const { rows: roleRows } = await pool.query(`SELECT id FROM roles WHERE name = 'student' LIMIT 1`);
  await pool.query(
    `INSERT INTO users (id, name, first_name, last_name, email, password_hash, role_id, preferred_currency, created_at, updated_at)
     VALUES ($1, 'Card Buyer', 'Card', 'Buyer', $2, 'test-hash', $3, 'EUR', NOW(), NOW())`,
    [seed.userId, `shopcb-${tag.toLowerCase()}@test.com`, roleRows[0]?.id || null]
  );
  authToken = jwt.sign({ id: seed.userId, role: 'student', email: `shopcb-${tag.toLowerCase()}@test.com` }, JWT_SECRET, { expiresIn: '1h' });

  const { rows: productRows } = await pool.query(
    `INSERT INTO products (name, category, price, stock_quantity, status)
     VALUES ($1, 'accessories', 50.00, $2, 'active') RETURNING id`,
    [`Callback Test Leash ${tag}`, INITIAL_STOCK]
  );
  seed.productId = productRows[0].id;

  seed.voucherCode = `CBK${tag}`;
  const { rows: voucherRows } = await pool.query(
    `INSERT INTO voucher_codes (code, name, voucher_type, discount_value, applies_to, usage_type, max_uses_per_user, total_uses, visibility, is_active)
     VALUES ($1, $1, 'percentage', 10, 'shop', 'unlimited', 100, 0, 'public', true)
     RETURNING id`,
    [seed.voucherCode]
  );
  seed.voucherId = voucherRows[0].id;
});

beforeEach(() => {
  verifyPayment.mockReset();
  dispatchToStaff.mockClear();
});

afterAll(async () => {
  const ids = seed.orderIds.map(String);
  const steps = [
    [`DELETE FROM manager_commissions WHERE source_type = 'shop' AND source_id::text = ANY($1::text[])`, [ids]],
    ['DELETE FROM voucher_redemptions WHERE voucher_code_id = $1', [seed.voucherId]],
    ['DELETE FROM user_tags WHERE user_id = $1', [seed.userId]],
    ['DELETE FROM wallet_transactions WHERE user_id = $1', [seed.userId]],
    ['DELETE FROM wallet_balances WHERE user_id = $1', [seed.userId]],
    ['DELETE FROM shop_orders WHERE user_id = $1', [seed.userId]],
    ['DELETE FROM voucher_codes WHERE id = $1', [seed.voucherId]],
    ['DELETE FROM products WHERE id = $1', [seed.productId]],
    ['DELETE FROM users WHERE id = $1', [seed.userId]],
  ];
  for (const [sql, params] of steps) {
    await pool.query(sql, params).catch((err) => process.stderr.write(`cleanup skipped: ${err.message}\n`));
  }
  // No pool.end(): server.js keeps long-lived pool clients (realtime LISTEN etc.),
  // so end() never resolves — same as the other supertest(app) suites (--forceExit).
});

describe('Iyzico callback — credit_card shop order', () => {
  test('successful payment confirms the order, debits the wallet portion and redeems the voucher exactly once', async () => {
    // €10 in the wallet → the card order defers a €10 wallet leg to the callback.
    await recordTransaction({
      userId: seed.userId,
      amount: 10,
      currency: 'EUR',
      transactionType: 'payment',
      direction: 'credit',
      availableDelta: 10,
      description: 'shop callback regression seed',
    });

    const stockBefore = await getStock();
    const usesBefore = await totalUses();
    const { orderId, orderNumber, gatewayToken } = await createCardOrder();

    // Creation path: what the callback must match.
    const created = await getOrder(orderId);
    expect(created.payment_method).toBe('credit_card');
    expect(created.payment_status).toBe('pending');
    expect(created.status).toBe('pending');
    expect(created.gateway_token).toBe(gatewayToken);
    expect(created.voucher_id).toBe(seed.voucherId);
    expect(created.wallet_deduction_data?.plan).toEqual([{ currency: 'EUR', amount: 10 }]);
    expect(await getStock()).toBe(stockBefore - 2); // reserved at creation
    expect(await redemptionsFor(orderId)).toHaveLength(0); // deferred to the callback
    expect(await walletDebitsFor(orderId)).toHaveLength(0);

    verifyPayment.mockResolvedValue({
      status: 'success',
      paymentId: 'pay-success-1',
      paidPrice: 80,
      currency: 'EUR',
      raw: { conversationId: orderNumber, basketId: `USR_${seed.userId}_TRX_1` },
    });

    const res = await postCallback(gatewayToken);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('status=success');
    expect(res.headers.location).toContain('type=shop');
    expect(res.headers.location).toContain(`order=${orderNumber}`);

    const paid = await getOrder(orderId);
    expect(paid.payment_status).toBe('completed');
    expect(paid.status).toBe('confirmed');
    expect(paid.confirmed_at).not.toBeNull();
    expect(paid.wallet_deduction_data).toBeNull();

    const debits = await walletDebitsFor(orderId);
    expect(debits).toHaveLength(1);
    expect(Number(debits[0].amount)).toBe(-10);

    const redemptions = await redemptionsFor(orderId);
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0].metadata.orderNumber).toBe(orderNumber);
    expect(await totalUses()).toBe(usesBefore + 1);

    const { rows: history } = await pool.query(
      `SELECT new_status, notes FROM shop_order_status_history WHERE order_id = $1 ORDER BY id`,
      [orderId]
    );
    expect(history.some((h) => h.new_status === 'confirmed' && /Iyzico/.test(h.notes))).toBe(true);
    expect(dispatchToStaff).toHaveBeenCalledWith(expect.objectContaining({ type: 'shop_order' }));
    expect(await getStock()).toBe(stockBefore - 2); // stock stays sold

    // Replayed callback (webhook + browser return / gateway retry): no double processing.
    const replay = await postCallback(gatewayToken);
    expect(replay.headers.location).toContain('status=success');
    expect(await redemptionsFor(orderId)).toHaveLength(1);
    expect(await totalUses()).toBe(usesBefore + 1);
    expect(await walletDebitsFor(orderId)).toHaveLength(1);
    expect((await getOrder(orderId)).payment_status).toBe('completed');
  });

  test('failed payment marks the order failed, releases the reserved stock and redeems nothing', async () => {
    const stockBefore = await getStock();
    const usesBefore = await totalUses();
    const { orderId, orderNumber, gatewayToken } = await createCardOrder();
    expect(await getStock()).toBe(stockBefore - 2);

    verifyPayment.mockRejectedValue(new Error('Payment not successful: FAILURE'));

    const res = await postCallback(gatewayToken);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('status=failed');
    expect(res.headers.location).toContain('type=shop');
    expect(res.headers.location).toContain(`order=${orderNumber}`);

    const failed = await getOrder(orderId);
    expect(failed.payment_status).toBe('failed');
    expect(failed.status).toBe('cancelled');
    expect(failed.cancelled_at).not.toBeNull();
    expect(failed.wallet_deduction_data).toBeNull();
    expect(await getStock()).toBe(stockBefore);
    expect(await redemptionsFor(orderId)).toHaveLength(0);
    expect(await totalUses()).toBe(usesBefore);
    expect(await walletDebitsFor(orderId)).toHaveLength(0);

    // Replayed failure: stock is not released twice.
    await postCallback(gatewayToken);
    expect(await getStock()).toBe(stockBefore);

    // A late success for the now-cancelled order must not confirm it.
    verifyPayment.mockReset();
    verifyPayment.mockResolvedValue({
      status: 'success', paymentId: 'pay-late-1', paidPrice: 90, currency: 'EUR',
      raw: { conversationId: orderNumber },
    });
    const late = await postCallback(gatewayToken);
    expect(late.headers.location).toContain('status=failed');
    const after = await getOrder(orderId);
    expect(after.payment_status).toBe('failed');
    expect(after.status).toBe('cancelled');
    expect(after.admin_notes).toContain('PAID_AFTER_CANCEL');
    expect(await redemptionsFor(orderId)).toHaveLength(0);
    expect(await getStock()).toBe(stockBefore);
  });

  test('a non-"Payment not successful" verification error leaves the order untouched', async () => {
    const stockBefore = await getStock();
    const { orderId, gatewayToken } = await createCardOrder();
    verifyPayment.mockRejectedValue(new Error('Verification failed'));

    const res = await postCallback(gatewayToken);
    expect(res.headers.location).toContain('status=failed');

    const order = await getOrder(orderId);
    expect(order.payment_status).toBe('pending');
    expect(order.status).toBe('pending');
    expect(await getStock()).toBe(stockBefore - 2);
  });
});
