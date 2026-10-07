// Regression: migration 291_backfill_shop_order_voucher_redemptions.sql
//
// Before the 2026-10-07 voucherService fix, redeemVoucher() failed for every
// shop order (SERIAL id into the UUID applied_to_id) so no voucher_redemptions
// row was written and voucher_codes.total_uses was never incremented. The
// migration backfills the missing rows exactly as the fixed redeemVoucher()
// writes them, only for orders redeemVoucher() would have been called for, and
// must be a no-op on a second run.
//
// Runs the migration SQL directly against the LOCAL dev DB
// (backend/.env → localhost:5432/plannivo_dev). Asserts only on the rows it
// seeds; cleans up after itself.

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';

import { pool } from '../../../../backend/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(
  __dirname,
  '../../../../backend/db/migrations/291_backfill_shop_order_voucher_redemptions.sql'
);

let sql;
const seed = { userId: null, voucherA: null, voucherB: null, orders: {} };

async function insertVoucher(code, totalUses = 0) {
  const { rows } = await pool.query(
    `INSERT INTO voucher_codes (code, name, voucher_type, discount_value, applies_to, usage_type, total_uses, visibility)
     VALUES ($1, $1, 'percentage', 10, 'shop', 'unlimited', $2, 'private')
     RETURNING id`,
    [code, totalUses]
  );
  return rows[0].id;
}

async function insertOrder({ voucherId, paymentMethod = 'wallet', status = 'confirmed', paymentStatus = 'completed',
  subtotal, discount, gatewayToken = null, createdAt }) {
  const { rows } = await pool.query(
    `INSERT INTO shop_orders (user_id, status, payment_method, payment_status, subtotal, discount_amount,
                              total_amount, currency, voucher_id, voucher_code, gateway_token, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $5::numeric - $6::numeric, 'EUR', $7,
             (SELECT code FROM voucher_codes WHERE id = $7), $8, $9)
     RETURNING id, order_number, created_at`,
    [seed.userId, status, paymentMethod, paymentStatus, subtotal, discount, voucherId, gatewayToken, createdAt]
  );
  return rows[0];
}

const redemptionsFor = async (orderId) => (await pool.query(
  `SELECT * FROM voucher_redemptions
    WHERE applied_to_type = 'shop'
      AND (metadata->>'referenceId' = $1 OR metadata->>'orderId' = $1)`,
  [String(orderId)]
)).rows;

const totalUses = async (voucherId) =>
  (await pool.query('SELECT total_uses FROM voucher_codes WHERE id = $1', [voucherId])).rows[0].total_uses;

beforeAll(async () => {
  sql = await fs.readFile(MIGRATION, 'utf8');

  seed.userId = randomUUID();
  const { rows } = await pool.query(`SELECT id FROM roles WHERE name = 'student' LIMIT 1`);
  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role_id, created_at, updated_at)
     VALUES ($1, 'Voucher Backfill', $2, 'test-hash', $3, NOW(), NOW())`,
    [seed.userId, `vbf-${seed.userId.slice(0, 8)}@test.com`, rows[0]?.id || null]
  );

  const tag = seed.userId.slice(0, 8).toUpperCase();
  seed.voucherA = await insertVoucher(`BFA${tag}`, 0);
  seed.voucherB = await insertVoucher(`BFB${tag}`, 1);
  // Private assignment — redeemVoucher marks it used.
  await pool.query(
    `INSERT INTO user_vouchers (user_id, voucher_code_id, is_used) VALUES ($1, $2, false)`,
    [seed.userId, seed.voucherA]
  );

  // Should be backfilled: redeemVoucher ran at order creation.
  seed.orders.wallet = await insertOrder({ voucherId: seed.voucherA, subtotal: '100.00', discount: '10.00', createdAt: '2026-08-01T09:00:00Z' });
  // Cancelled later — redeemVoucher had still run at creation → backfilled.
  seed.orders.cancelled = await insertOrder({ voucherId: seed.voucherA, status: 'cancelled', subtotal: '50.00', discount: '5.00', createdAt: '2026-08-02T09:00:00Z' });
  // iyzico order that paid → redeemed in the callback → backfilled.
  seed.orders.cardPaid = await insertOrder({ voucherId: seed.voucherA, paymentMethod: 'credit_card', subtotal: '80.00', discount: '8.00', gatewayToken: `tok-paid-${tag}`, createdAt: '2026-08-03T09:00:00Z' });
  // iyzico order never paid → redeemVoucher never called → skipped.
  seed.orders.cardPending = await insertOrder({ voucherId: seed.voucherA, paymentMethod: 'credit_card', status: 'pending', paymentStatus: 'pending', subtotal: '70.00', discount: '7.00', gatewayToken: `tok-pend-${tag}`, createdAt: '2026-08-04T09:00:00Z' });
  // Already has a redemption (post-fix shape) → skipped, counter untouched.
  seed.orders.alreadyRedeemed = await insertOrder({ voucherId: seed.voucherB, subtotal: '40.00', discount: '4.00', createdAt: '2026-10-07T09:00:00Z' });
  await pool.query(
    `INSERT INTO voucher_redemptions (voucher_code_id, user_id, applied_to_type, applied_to_id,
       original_amount, discount_amount, final_amount, currency, status, metadata)
     VALUES ($1, $2, 'shop', NULL, 40, 4, 36, 'EUR', 'applied', $3::jsonb)`,
    [seed.voucherB, seed.userId, JSON.stringify({
      referenceId: String(seed.orders.alreadyRedeemed.id),
      orderId: String(seed.orders.alreadyRedeemed.id),
      orderNumber: seed.orders.alreadyRedeemed.order_number,
    })]
  );
});

afterAll(async () => {
  const vids = [seed.voucherA, seed.voucherB].filter(Boolean);
  if (vids.length) {
    await pool.query('DELETE FROM user_vouchers WHERE voucher_code_id = ANY($1::uuid[])', [vids]);
    await pool.query('DELETE FROM voucher_redemptions WHERE voucher_code_id = ANY($1::uuid[])', [vids]);
  }
  if (seed.userId) await pool.query('DELETE FROM shop_orders WHERE user_id = $1', [seed.userId]);
  if (vids.length) await pool.query('DELETE FROM voucher_codes WHERE id = ANY($1::uuid[])', [vids]);
  if (seed.userId) await pool.query('DELETE FROM users WHERE id = $1', [seed.userId]);
  await pool.end();
});

describe('migration 291 — backfill shop order voucher redemptions', () => {
  test('first run inserts the missing redemptions exactly like redeemVoucher and bumps total_uses', async () => {
    for (const key of ['wallet', 'cancelled', 'cardPaid', 'cardPending']) {
      expect(await redemptionsFor(seed.orders[key].id)).toHaveLength(0);
    }

    await pool.query(sql);

    const [wallet] = await redemptionsFor(seed.orders.wallet.id);
    expect(wallet).toBeDefined();
    expect(wallet.voucher_code_id).toBe(seed.voucherA);
    expect(wallet.user_id).toBe(seed.userId);
    expect(wallet.applied_to_type).toBe('shop');
    expect(wallet.applied_to_id).toBeNull();
    expect(wallet.status).toBe('applied');
    expect(wallet.currency).toBe('EUR');
    expect(wallet.original_amount).toBe('100.00');
    expect(wallet.discount_amount).toBe('10.00');
    expect(wallet.final_amount).toBe('90.00');
    expect(new Date(wallet.created_at).toISOString()).toBe(new Date(seed.orders.wallet.created_at).toISOString());
    expect(wallet.metadata).toMatchObject({
      referenceId: String(seed.orders.wallet.id),
      orderId: String(seed.orders.wallet.id),
      orderNumber: seed.orders.wallet.order_number,
      backfilled: true,
    });

    expect(await redemptionsFor(seed.orders.cancelled.id)).toHaveLength(1);
    expect(await redemptionsFor(seed.orders.cardPaid.id)).toHaveLength(1);
    expect(await redemptionsFor(seed.orders.cardPending.id)).toHaveLength(0);
    expect(await redemptionsFor(seed.orders.alreadyRedeemed.id)).toHaveLength(1);

    expect(await totalUses(seed.voucherA)).toBe(3);
    expect(await totalUses(seed.voucherB)).toBe(1);

    const { rows: uv } = await pool.query(
      'SELECT is_used, used_at FROM user_vouchers WHERE user_id = $1 AND voucher_code_id = $2',
      [seed.userId, seed.voucherA]
    );
    expect(uv[0].is_used).toBe(true);
    expect(new Date(uv[0].used_at).toISOString()).toBe(new Date(seed.orders.wallet.created_at).toISOString());
  });

  test('second run is a no-op', async () => {
    const countRows = async () => (await pool.query(
      'SELECT COUNT(*)::int AS n FROM voucher_redemptions WHERE voucher_code_id = ANY($1::uuid[])',
      [[seed.voucherA, seed.voucherB]]
    )).rows[0].n;

    const before = await countRows();
    await pool.query(sql);
    expect(await countRows()).toBe(before);
    expect(before).toBe(4);
    expect(await totalUses(seed.voucherA)).toBe(3);
    expect(await totalUses(seed.voucherB)).toBe(1);
  });
});
