-- Migration: 280_add_beach_fee_to_member_offerings.sql
-- Description:
--   Split a membership's price into a commissionable "beach fee" portion and a
--   non-commissionable storage portion, so the manager's 10% applies to the
--   BEACH-FACILITIES fee only (not the equipment-storage fee) on bundled
--   "Storage + Beach" offerings.
--
--   `beach_fee_amount` is the portion the manager earns commission on. The
--   storage portion is implied as (price - beach_fee_amount). `price` stays the
--   full charged amount used everywhere on the storefront / wallet.
--
--   Snapshot column on member_purchases mirrors the offering_price snapshot so a
--   later offering edit never retro-changes an existing purchase's commission base.
--
-- Created: 2026-06-24

-- ── Catalog (member_offerings) ──────────────────────────────────────────────
ALTER TABLE member_offerings
  ADD COLUMN IF NOT EXISTS beach_fee_amount NUMERIC(10, 2);

COMMENT ON COLUMN member_offerings.beach_fee_amount IS
  'Commissionable (beach-facilities) portion of price. Manager earns commission on this only. NULL falls back to full price. Storage portion = price - beach_fee_amount.';

-- ── Per-purchase snapshot (member_purchases) ────────────────────────────────
ALTER TABLE member_purchases
  ADD COLUMN IF NOT EXISTS beach_fee_amount NUMERIC(10, 2);

COMMENT ON COLUMN member_purchases.beach_fee_amount IS
  'Snapshot of the offering beach_fee_amount at purchase time (commissionable base). NULL falls back to offering_price.';

-- ── Backfill catalog ────────────────────────────────────────────────────────
-- Beach passes / memberships are fully commissionable → beach = full price.
UPDATE member_offerings
   SET beach_fee_amount = price
 WHERE beach_fee_amount IS NULL
   AND COALESCE(category, 'membership') <> 'storage';

-- Storage offerings (pure storage AND bundled "Storage + Beach") default to 0
-- commissionable — the manager does NOT get paid on storage. The owner then
-- raises the beach portion on each bundled offering in Membership Settings so
-- the manager earns 10% on that part of future sales.
UPDATE member_offerings
   SET beach_fee_amount = 0
 WHERE beach_fee_amount IS NULL
   AND COALESCE(category, 'membership') = 'storage';

-- ── Backfill existing purchases (snapshot from their offering's category) ────
-- Non-storage purchases keep full price commissionable; storage purchases → 0.
UPDATE member_purchases mp
   SET beach_fee_amount = CASE
         WHEN COALESCE(mo.category, 'membership') = 'storage' THEN 0
         ELSE mp.offering_price
       END
  FROM member_offerings mo
 WHERE mp.offering_id = mo.id
   AND mp.beach_fee_amount IS NULL;

-- Safety net for purchases whose offering row is gone: treat as fully commissionable.
UPDATE member_purchases
   SET beach_fee_amount = offering_price
 WHERE beach_fee_amount IS NULL;
