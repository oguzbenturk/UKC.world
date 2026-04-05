-- Add customer_package_id to booking_participants table
-- This allows tracking which package each participant used for payment

-- Add customer_package_id column to booking_participants table
ALTER TABLE booking_participants 
ADD COLUMN customer_package_id INTEGER;

-- Add foreign key constraint
ALTER TABLE booking_participants 
ADD CONSTRAINT fk_booking_participants_customer_package 
FOREIGN KEY (customer_package_id) REFERENCES customer_packages(id);

-- Add index for performance
CREATE INDEX idx_booking_participants_customer_package_id 
ON booking_participants(customer_package_id);

-- Add comment for documentation
COMMENT ON COLUMN booking_participants.customer_package_id IS 
'References the customer package used for payment by this participant';
