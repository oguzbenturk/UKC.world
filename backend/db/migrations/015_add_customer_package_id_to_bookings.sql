-- Add customer_package_id to bookings table to track which package was used
-- This allows us to display specific package information in lesson history

-- Add column only if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'customer_package_id'
  ) THEN
    ALTER TABLE bookings 
    ADD COLUMN customer_package_id UUID REFERENCES customer_packages(id);
  END IF;
END $$;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_bookings_customer_package_id ON bookings(customer_package_id);

-- Add comment
COMMENT ON COLUMN bookings.customer_package_id IS 'References the customer package used for this booking, null for non-package bookings';
