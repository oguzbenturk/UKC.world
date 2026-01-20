-- Migration: add health profile fields to users
-- Adds age and weight tracking columns for customer profile banner

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'age'
    ) THEN
        ALTER TABLE public.users
        ADD COLUMN age SMALLINT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'weight'
    ) THEN
        ALTER TABLE public.users
        ADD COLUMN weight NUMERIC(6,2);
    END IF;
END $$;

COMMENT ON COLUMN public.users.age IS 'Stored age in years when provided by staff (optional)';
COMMENT ON COLUMN public.users.weight IS 'Customer weight in kilograms (optional)';
