const { Pool } = require('pg');
require('dotenv').config({ path: './backend/.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    console.log('Creating table bank_transfer_receipts...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bank_transfer_receipts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
          customer_package_id UUID REFERENCES customer_packages(id) ON DELETE CASCADE,
          bank_account_id UUID REFERENCES wallet_bank_accounts(id) ON DELETE SET NULL,
          receipt_url TEXT NOT NULL,
          amount NUMERIC(10, 2) NOT NULL,
          currency VARCHAR(10) DEFAULT 'EUR',
          status VARCHAR(20) DEFAULT 'pending',
          notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table created successfully!');
  } catch (err) {
    console.error('Error creating table:', err);
  } finally {
    pool.end();
  }
}

run();
