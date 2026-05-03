-- 258_separate_staff_salary_from_wallet_balance.sql
--
-- Bug: salary/commission payouts to staff (manager_payment, instructor_payment)
-- were inflating their wallet_balances.available_amount. The wallet is meant
-- for customer-style credit, not payroll, but `recordLegacyTransaction` in
-- backend/services/walletService.js defaults `available_delta` to the full
-- transaction amount when the caller doesn't specify, so every staff payout
-- was being added to the recipient's available wallet balance.
--
-- The four call sites have been updated to pass `availableDelta: 0`:
--   - POST/PUT /api/manager/commissions/admin/managers/:id/payments
--   - DELETE   /api/manager/commissions/admin/managers/:id/payments/:pid
--   - POST/PUT /api/finances/instructor-payments
--   - DELETE   /api/finances/instructor-payments/:id
--
-- This migration cleans up the historical data so existing wallet balances
-- match the corrected ledger:
--   1. Zero out available_delta on completed staff payout transactions,
--      stashing the prior value in metadata for audit.
--   2. Recompute wallet_balances.available_amount for every affected
--      (user_id, currency) pair from the corrected ledger.
--
-- Some users may end up with a negative available_amount (they spent against
-- the inflated balance). We allow that so the discrepancy is visible for
-- manual review rather than silently absorbed.

BEGIN;

-- The wallet_guard_non_negative_balance trigger blocks negative balances.
-- Recalculation may produce negatives where staff "spent" inflated wallet
-- credit, so we permit them for the duration of this transaction.
SELECT set_config('wallet.allow_negative', 'true', true);

-- 1. Zero out the buggy deltas. Capture the previous value in metadata so the
--    change is auditable and idempotent (the WHERE excludes rows already at 0,
--    so re-running this migration is a no-op).
UPDATE wallet_transactions
   SET available_delta = 0,
       metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
         'salaryWalletFix', jsonb_build_object(
           'migration', '258',
           'appliedAt', NOW(),
           'previousAvailableDelta', available_delta
         )
       )
 WHERE entity_type IN ('manager_payment', 'instructor_payment')
   AND transaction_type IN ('payment', 'deduction')
   AND status = 'completed'
   AND available_delta <> 0;

-- 2. Recompute wallet_balances for every user/currency that has any staff
--    payout transactions, since their available_amount no longer matches
--    SUM(available_delta) over their completed ledger.
WITH affected_balances AS (
  SELECT DISTINCT user_id, currency
    FROM wallet_transactions
   WHERE entity_type IN ('manager_payment', 'instructor_payment')
),
recomputed AS (
  SELECT wt.user_id,
         wt.currency,
         COALESCE(SUM(wt.available_delta), 0)        AS available_amount,
         COALESCE(SUM(wt.pending_delta), 0)          AS pending_amount,
         COALESCE(SUM(wt.non_withdrawable_delta), 0) AS non_withdrawable_amount
    FROM wallet_transactions wt
    JOIN affected_balances ab
      ON ab.user_id = wt.user_id AND ab.currency = wt.currency
   WHERE wt.status = 'completed'
   GROUP BY wt.user_id, wt.currency
)
UPDATE wallet_balances wb
   SET available_amount        = r.available_amount,
       pending_amount          = r.pending_amount,
       non_withdrawable_amount = r.non_withdrawable_amount,
       updated_at              = NOW()
  FROM recomputed r
 WHERE wb.user_id = r.user_id
   AND wb.currency = r.currency;

-- A wallet_balances row may not exist for users who had only staff payouts
-- and no other transactions; their corrected balance is zero, so there's
-- nothing to insert.

COMMIT;
