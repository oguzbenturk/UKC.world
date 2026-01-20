-- 016_add_created_by_columns.sql
-- Introduce created_by auditing columns (and related constraints/indexes) across core business tables.

-- Utility procedure to add a created_by column if it does not yet exist
DO $$
DECLARE
  v_table_name text;
BEGIN
  FOR v_table_name IN SELECT unnest(ARRAY[
    'bookings',
    'booking_participants',
    'booking_series_customers',
    'payment_intents',
    'refunds',
    'rentals',
    'rental_equipment',
    'services',
    'service_packages',
    'customer_packages',
    'student_accounts',
    'popup_user_interactions'
  ])
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table_name
        AND column_name = 'created_by'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN created_by uuid', v_table_name);
    END IF;
  END LOOP;
END $$;

-- Ensure transactions table has created_by column (already present in some environments)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN created_by uuid;
  END IF;
END $$;

-- Convert spare_parts_orders.created_by (integer) into UUID-based column while retaining legacy data for backfill
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'spare_parts_orders'
      AND column_name = 'created_by'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE public.spare_parts_orders RENAME COLUMN created_by TO created_by_legacy_int;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'spare_parts_orders'
      AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.spare_parts_orders ADD COLUMN created_by uuid;
  END IF;
END $$;

-- Attach foreign keys to users(id) where missing
DO $$
DECLARE
  fk_record RECORD;
BEGIN
  FOR fk_record IN SELECT * FROM (
    VALUES
      ('bookings', 'bookings_created_by_fkey'),
      ('booking_participants', 'booking_participants_created_by_fkey'),
      ('booking_series_customers', 'booking_series_customers_created_by_fkey'),
      ('payment_intents', 'payment_intents_created_by_fkey'),
      ('refunds', 'refunds_created_by_fkey'),
      ('rentals', 'rentals_created_by_fkey'),
      ('rental_equipment', 'rental_equipment_created_by_fkey'),
      ('services', 'services_created_by_fkey'),
      ('service_packages', 'service_packages_created_by_fkey'),
      ('customer_packages', 'customer_packages_created_by_fkey'),
      ('student_accounts', 'student_accounts_created_by_fkey'),
      ('popup_user_interactions', 'popup_user_interactions_created_by_fkey'),
      ('transactions', 'transactions_created_by_fkey'),
      ('spare_parts_orders', 'spare_parts_orders_created_by_fkey')
  ) AS t(table_name, constraint_name)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = fk_record.table_name
        AND column_name = 'created_by'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints tc
      WHERE tc.table_schema = 'public'
        AND tc.table_name = fk_record.table_name
        AND tc.constraint_name = fk_record.constraint_name
    )
    THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL',
        fk_record.table_name,
        fk_record.constraint_name
      );
    END IF;
  END LOOP;
END $$;

-- Indexes to keep lookup performance acceptable
CREATE INDEX IF NOT EXISTS bookings_created_by_idx ON public.bookings(created_by);
CREATE INDEX IF NOT EXISTS payment_intents_created_by_idx ON public.payment_intents(created_by);
CREATE INDEX IF NOT EXISTS rentals_created_by_idx ON public.rentals(created_by);
CREATE INDEX IF NOT EXISTS transactions_created_by_idx ON public.transactions(created_by);
CREATE INDEX IF NOT EXISTS services_created_by_idx ON public.services(created_by);
CREATE INDEX IF NOT EXISTS service_packages_created_by_idx ON public.service_packages(created_by);
CREATE INDEX IF NOT EXISTS customer_packages_created_by_idx ON public.customer_packages(created_by);
CREATE INDEX IF NOT EXISTS refunds_created_by_idx ON public.refunds(created_by);
CREATE INDEX IF NOT EXISTS booking_participants_created_by_idx ON public.booking_participants(created_by);
CREATE INDEX IF NOT EXISTS booking_series_customers_created_by_idx ON public.booking_series_customers(created_by);
CREATE INDEX IF NOT EXISTS popup_user_interactions_created_by_idx ON public.popup_user_interactions(created_by);
CREATE INDEX IF NOT EXISTS student_accounts_created_by_idx ON public.student_accounts(created_by);
CREATE INDEX IF NOT EXISTS rental_equipment_created_by_idx ON public.rental_equipment(created_by);
CREATE INDEX IF NOT EXISTS spare_parts_orders_created_by_idx ON public.spare_parts_orders(created_by);

-- Ensure updated_at triggers stay intact (no changes needed here)