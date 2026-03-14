-- Migration: Enhance manager commission settings with salary types
-- Adds support for: commission-based, fixed-per-lesson, and monthly-salary modes
-- Also adds shop_rate, membership_rate columns for per-category commission

-- Add salary type to manager_commission_settings
ALTER TABLE manager_commission_settings
  ADD COLUMN IF NOT EXISTS salary_type VARCHAR(30) DEFAULT 'commission',
  ADD COLUMN IF NOT EXISTS fixed_salary_amount DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_lesson_amount DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shop_rate DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS membership_rate DECIMAL(5,2);

-- salary_type values:
--   'commission'       → percentage-based (flat or per_category)
--   'fixed_per_lesson' → fixed € per completed lesson
--   'monthly_salary'   → fixed monthly salary amount

COMMENT ON COLUMN manager_commission_settings.salary_type IS 'commission | fixed_per_lesson | monthly_salary';
COMMENT ON COLUMN manager_commission_settings.fixed_salary_amount IS 'Monthly salary amount (used when salary_type = monthly_salary)';
COMMENT ON COLUMN manager_commission_settings.per_lesson_amount IS 'Fixed EUR per completed lesson (used when salary_type = fixed_per_lesson)';
COMMENT ON COLUMN manager_commission_settings.shop_rate IS 'Commission % for shop/product sales (per_category mode)';
COMMENT ON COLUMN manager_commission_settings.membership_rate IS 'Commission % for membership sales (per_category mode)';

-- Create manager_salary_records table for monthly salary and per-lesson tracking
CREATE TABLE IF NOT EXISTS manager_salary_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manager_user_id UUID NOT NULL REFERENCES users(id),
    
    period_month VARCHAR(7) NOT NULL,          -- YYYY-MM
    salary_type VARCHAR(30) NOT NULL,          -- commission | fixed_per_lesson | monthly_salary
    
    -- For monthly salary
    base_salary DECIMAL(12,2) DEFAULT 0,
    
    -- For per-lesson salary
    lesson_count INTEGER DEFAULT 0,
    per_lesson_rate DECIMAL(12,2) DEFAULT 0,
    lesson_earnings DECIMAL(12,2) DEFAULT 0,
    
    -- For commission (aggregated from manager_commissions)
    commission_earnings DECIMAL(12,2) DEFAULT 0,
    
    -- Totals
    gross_amount DECIMAL(12,2) DEFAULT 0,
    deductions DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'EUR',
    
    status VARCHAR(30) DEFAULT 'pending',      -- pending | approved | paid
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_manager_salary_period UNIQUE (manager_user_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_manager_salary_records_manager ON manager_salary_records(manager_user_id);
CREATE INDEX IF NOT EXISTS idx_manager_salary_records_period ON manager_salary_records(period_month);
CREATE INDEX IF NOT EXISTS idx_manager_salary_records_status ON manager_salary_records(status);
