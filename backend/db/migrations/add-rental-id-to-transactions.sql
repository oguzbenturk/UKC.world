-- Add rental_id field to transactions table for rental financial tracking
ALTER TABLE transactions ADD COLUMN rental_id uuid;
ALTER TABLE transactions ADD CONSTRAINT transactions_rental_id_fkey 
  FOREIGN KEY (rental_id) REFERENCES rentals(id);

-- Create an index for performance
CREATE INDEX idx_transactions_rental ON transactions USING btree (rental_id);
