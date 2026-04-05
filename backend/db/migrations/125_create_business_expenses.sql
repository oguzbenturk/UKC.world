-- Create business_expenses table for tracking business operating expenses
-- These are manual expense entries by admins/managers/frontdesk
-- Migration: 125_create_business_expenses.sql

CREATE TABLE IF NOT EXISTS business_expenses (
    id SERIAL PRIMARY KEY,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'EUR',
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    description TEXT NOT NULL,
    vendor VARCHAR(255),
    receipt_url VARCHAR(500),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method VARCHAR(50) CHECK (payment_method IN ('cash', 'bank_transfer', 'card', 'wallet', 'other')),
    reference_number VARCHAR(100),
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_frequency VARCHAR(20) CHECK (recurring_frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_business_expenses_expense_date ON business_expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_business_expenses_category ON business_expenses(category);
CREATE INDEX IF NOT EXISTS idx_business_expenses_created_by ON business_expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_business_expenses_status ON business_expenses(status);
CREATE INDEX IF NOT EXISTS idx_business_expenses_deleted_at ON business_expenses(deleted_at) WHERE deleted_at IS NULL;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_business_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_business_expenses_updated_at ON business_expenses;
CREATE TRIGGER trigger_update_business_expenses_updated_at
    BEFORE UPDATE ON business_expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_business_expenses_updated_at();

-- Insert some default expense categories as comments for reference
-- Categories: rent, utilities, salaries, equipment, maintenance, supplies, marketing, insurance, 
--            professional_services, travel, software_subscriptions, bank_fees, taxes, other

COMMENT ON TABLE business_expenses IS 'Business operating expenses entered manually by staff';
COMMENT ON COLUMN business_expenses.category IS 'Primary category: rent, utilities, salaries, equipment, maintenance, supplies, marketing, insurance, professional_services, travel, software_subscriptions, bank_fees, taxes, other';
