-- 266_deleted_user_wallet_archive.sql
-- Hard-deleting a user wipes wallet_transactions + wallet_balances + wallet_audit_logs
-- with no record — any outstanding debt or credit silently vanishes and the financial
-- history is unrecoverable for disputes/reconciliation. This table preserves a snapshot
-- (balances + full ledger + summary) taken just before the destructive delete runs.

CREATE TABLE IF NOT EXISTS deleted_user_wallet_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT,
  balances JSONB NOT NULL DEFAULT '[]'::jsonb,
  transaction_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  transactions JSONB NOT NULL DEFAULT '[]'::jsonb,
  archived_by UUID,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deleted_user_wallet_archive_user ON deleted_user_wallet_archive(user_id);
CREATE INDEX IF NOT EXISTS idx_deleted_user_wallet_archive_archived_at ON deleted_user_wallet_archive(archived_at);
