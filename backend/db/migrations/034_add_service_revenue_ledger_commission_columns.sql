-- 034_add_service_revenue_ledger_commission_columns.sql
-- Add instructor commission columns to service_revenue_ledger

ALTER TABLE service_revenue_ledger
    ADD COLUMN IF NOT EXISTS instructor_commission_amount numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE service_revenue_ledger
    ADD COLUMN IF NOT EXISTS instructor_commission_type text;

ALTER TABLE service_revenue_ledger
    ADD COLUMN IF NOT EXISTS instructor_commission_value numeric(12,2);

ALTER TABLE service_revenue_ledger
    ADD COLUMN IF NOT EXISTS instructor_commission_source text;
