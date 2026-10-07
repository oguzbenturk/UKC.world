-- Migration 291: backfill voucher redemptions for shop orders placed before the
-- 2026-10-07 voucherService fix.
--
-- Bug: shop_orders.id is SERIAL/INTEGER but voucher_redemptions.applied_to_id is
-- UUID. redeemVoucher() passed String(order.id) as applied_to_id, the INSERT
-- failed ("invalid input syntax for type uuid"), the caller swallowed the error
-- (non-blocking) and the `total_uses + 1` UPDATE that follows the INSERT never
-- ran. The discount itself WAS applied (shop_orders.discount_amount), so every
-- voucher shop order before the fix has no redemption row and its voucher's
-- total_uses / per-user count is too low (limits not enforced).
--
-- This inserts the missing row exactly as the fixed redeemVoucher() now writes
-- it (applied_to_type 'shop' — the only shop value the voucher_redemptions
-- CHECK allows — applied_to_id NULL, the integer id in metadata.referenceId) and
-- applies the matching total_uses increment + private user_vouchers flag.
--
-- Which orders redeemVoucher() WOULD have been called for (routes/shopOrders.js
-- POST / and the iyzico callback in server.js):
--   * payment_method wallet / cash / card / bank_transfer, and credit_card /
--     wallet_hybrid orders fully covered by the wallet: redeemed right after the
--     order COMMIT, regardless of what happened to the order later — so
--     cancelled / refunded orders ARE included (nothing ever un-redeems).
--   * credit_card / wallet_hybrid orders sent to iyzico: redeemed only in the
--     successful payment callback. Such an order only counts when its payment
--     actually completed (payment_status completed / deposit_paid, or refunded
--     which implies it was paid). Pending / failed / abandoned gateway orders are
--     skipped. Wallet-covered card orders are set to 'completed' at creation, so
--     the same filter keeps them.
--   * wallet_credit vouchers: discount_amount is 0 and the wallet credit was
--     already posted (applyWalletCredit ran BEFORE the failing INSERT) — only the
--     redemption row is missing; no wallet row is written here.
--
-- Idempotent: an order is skipped when ANY shop redemption already references
-- it (metadata->>'referenceId' or metadata->>'orderId' = order id), so a second
-- run inserts nothing and — because total_uses / user_vouchers are only touched
-- for rows inserted by THIS run — changes nothing.
--
-- total_uses: the statement's snapshot cannot see its own inserted rows, so the
-- recount is GREATEST(current total_uses, existing redemption rows) + rows
-- inserted now = redemption rows after the insert, and never lower than the
-- current counter (total_uses is never decremented anywhere, and users.js
-- deletes a user's redemption rows, so the stored counter can exceed the rows).

WITH candidates AS (
  SELECT o.id, o.order_number, o.user_id, o.voucher_id,
         o.subtotal, COALESCE(o.discount_amount, 0) AS discount_amount,
         o.currency, o.gateway_token, o.created_at
  FROM shop_orders o
  JOIN voucher_codes vc ON vc.id = o.voucher_id
  WHERE o.voucher_id IS NOT NULL
    AND (
      o.payment_method NOT IN ('credit_card', 'wallet_hybrid')
      OR o.payment_status IN ('completed', 'deposit_paid', 'refunded')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM voucher_redemptions vr
      WHERE vr.applied_to_type = 'shop'
        AND (vr.metadata->>'referenceId' = o.id::text
             OR vr.metadata->>'orderId' = o.id::text)
    )
),
inserted AS (
  INSERT INTO voucher_redemptions (
    voucher_code_id, user_id, redeemed_at, applied_to_type, applied_to_id,
    original_amount, discount_amount, final_amount, currency, status, metadata,
    created_at, updated_at
  )
  SELECT
    c.voucher_id,
    c.user_id,
    c.created_at,
    'shop',
    NULL,
    c.subtotal,
    c.discount_amount,
    GREATEST(c.subtotal - c.discount_amount, 0),
    -- create route passes 'EUR'; the iyzico callback passes order.currency
    CASE WHEN c.gateway_token IS NULL THEN 'EUR' ELSE COALESCE(c.currency, 'EUR') END,
    'applied',
    jsonb_build_object(
      'referenceId', c.id::text,
      'orderId', c.id::text,
      'orderNumber', c.order_number,
      'backfilled', true,
      'backfillMigration', '291_backfill_shop_order_voucher_redemptions'
    ),
    c.created_at,
    NOW()
  FROM candidates c
  RETURNING voucher_code_id, user_id, created_at
),
per_voucher AS (
  SELECT voucher_code_id, COUNT(*)::int AS n
  FROM inserted
  GROUP BY voucher_code_id
),
existing_rows AS (
  SELECT vr.voucher_code_id, COUNT(*)::int AS n
  FROM voucher_redemptions vr
  WHERE vr.voucher_code_id IN (SELECT voucher_code_id FROM per_voucher)
  GROUP BY vr.voucher_code_id
),
bump_uses AS (
  UPDATE voucher_codes v
  SET total_uses = GREATEST(COALESCE(v.total_uses, 0), COALESCE(e.n, 0)) + p.n,
      updated_at = NOW()
  FROM per_voucher p
  LEFT JOIN existing_rows e ON e.voucher_code_id = p.voucher_code_id
  WHERE v.id = p.voucher_code_id
  RETURNING v.id
),
first_use AS (
  SELECT voucher_code_id, user_id, MIN(created_at) AS used_at
  FROM inserted
  GROUP BY voucher_code_id, user_id
)
UPDATE user_vouchers uv
SET is_used = true,
    used_at = f.used_at
FROM first_use f
WHERE uv.voucher_code_id = f.voucher_code_id
  AND uv.user_id = f.user_id
  AND uv.is_used = false;
