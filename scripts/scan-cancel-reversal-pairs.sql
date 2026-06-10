-- Read-only: find wallets with phantom balance from cancel+reversal pairs.
-- Pattern: a COMPLETED *_reversal row whose reversed original is now
-- status='cancelled' (or hard-deleted). Either state alone undoes the original;
-- both together swing the completed-ledger by 2x (phantom = -original delta).
\echo '=== completed reversal rows whose original is cancelled or gone ==='
SELECT u.name, rev.user_id, rev.amount AS reversal_amount, rev.currency,
       rev.created_at::date AS reversed_on,
       orig.id IS NULL AS original_hard_deleted,
       orig.status AS original_status,
       left(rev.description, 60) AS descr
  FROM wallet_transactions rev
  LEFT JOIN wallet_transactions orig
         ON orig.id = NULLIF(rev.metadata->>'reversedTransactionId','')::uuid
  LEFT JOIN users u ON u.id = rev.user_id
 WHERE rev.status = 'completed'
   AND rev.transaction_type LIKE '%reversal%'
   AND (orig.id IS NULL OR orig.status = 'cancelled')
 ORDER BY rev.created_at;

\echo '=== cache vs completed-ledger drift across all wallets (sanity) ==='
SELECT u.name, wb.currency, wb.available_amount AS cached,
       COALESCE(l.s, 0) AS ledger_completed_sum,
       ROUND(wb.available_amount - COALESCE(l.s, 0), 2) AS drift
  FROM wallet_balances wb
  JOIN users u ON u.id = wb.user_id
  LEFT JOIN LATERAL (
    SELECT SUM(available_delta) AS s
      FROM wallet_transactions wt
     WHERE wt.user_id = wb.user_id AND wt.currency = wb.currency AND wt.status = 'completed'
  ) l ON true
 WHERE ABS(wb.available_amount - COALESCE(l.s, 0)) > 0.01
 ORDER BY ABS(wb.available_amount - COALESCE(l.s, 0)) DESC
 LIMIT 25;
