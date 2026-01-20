import { pool } from './db.js';

async function updateMemberPurchasesTable() {
  const client = await pool.connect();
  try {
    console.log('Checking member_purchases table...');
    
    // Check if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'member_purchases'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('member_purchases table does not exist. Creating it...');
      await client.query(`
        CREATE TABLE member_purchases (
          id SERIAL PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          offering_id INT NOT NULL REFERENCES member_offerings(id) ON DELETE CASCADE,
          offering_name VARCHAR(255) NOT NULL,
          offering_price DECIMAL(10, 2) NOT NULL,
          offering_currency VARCHAR(3) DEFAULT 'EUR',
          purchased_at TIMESTAMPTZ DEFAULT NOW(),
          expires_at TIMESTAMPTZ,
          status VARCHAR(50) DEFAULT 'active',
          payment_method VARCHAR(50) DEFAULT 'cash',
          payment_status VARCHAR(50) DEFAULT 'completed',
          notes TEXT,
          created_by UUID,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        CREATE INDEX idx_member_purchases_user ON member_purchases(user_id);
        CREATE INDEX idx_member_purchases_offering ON member_purchases(offering_id);
        CREATE INDEX idx_member_purchases_status ON member_purchases(status);
      `);
      console.log('✅ member_purchases table created successfully!');
    } else {
      console.log('member_purchases table exists. Checking schema...');
      
      // Get current column types
      const columns = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'member_purchases'
        ORDER BY ordinal_position;
      `);
      
      console.log('Current schema:', columns.rows);
      
      // Check if user_id is UUID
      const userIdCol = columns.rows.find(c => c.column_name === 'user_id');
      if (userIdCol && userIdCol.data_type !== 'uuid') {
        console.log('⚠️  user_id is not UUID! Dropping and recreating table...');
        
        await client.query('DROP TABLE IF EXISTS member_purchases CASCADE;');
        
        await client.query(`
          CREATE TABLE member_purchases (
            id SERIAL PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            offering_id INT NOT NULL REFERENCES member_offerings(id) ON DELETE CASCADE,
            offering_name VARCHAR(255) NOT NULL,
            offering_price DECIMAL(10, 2) NOT NULL,
            offering_currency VARCHAR(3) DEFAULT 'EUR',
            purchased_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ,
            status VARCHAR(50) DEFAULT 'active',
            payment_method VARCHAR(50) DEFAULT 'cash',
            payment_status VARCHAR(50) DEFAULT 'completed',
            notes TEXT,
            created_by UUID,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
          
          CREATE INDEX idx_member_purchases_user ON member_purchases(user_id);
          CREATE INDEX idx_member_purchases_offering ON member_purchases(offering_id);
          CREATE INDEX idx_member_purchases_status ON member_purchases(status);
        `);
        
        console.log('✅ Table recreated with correct schema!');
      } else {
        // Check if offering_currency column exists
        const currencyCol = columns.rows.find(c => c.column_name === 'offering_currency');
        if (!currencyCol) {
          console.log('Adding offering_currency column...');
          await client.query(`
            ALTER TABLE member_purchases 
            ADD COLUMN IF NOT EXISTS offering_currency VARCHAR(3) DEFAULT 'EUR';
          `);
          console.log('✅ offering_currency column added!');
        } else {
          console.log('✅ Schema is correct!');
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

updateMemberPurchasesTable().catch(console.error);
