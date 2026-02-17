// Script to add trusted_customer role
import { pool } from '../db.js';

const addTrustedCustomerRole = async () => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      INSERT INTO roles (id, name, created_at, updated_at) 
      SELECT 'a7b8c9d0-e1f2-43a4-b5c6-d7e8f9a0b1c2', 'trusted_customer', NOW(), NOW() 
      WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'trusted_customer') 
      RETURNING *
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Role created:', result.rows[0]);
    } else {
      console.log('ℹ️  Role already exists');
    }
    
    // Verify
    const verify = await client.query(`SELECT * FROM roles WHERE name = 'trusted_customer'`);
    console.log('📋 Verification:', verify.rows);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
  }
  process.exit(0);
};

addTrustedCustomerRole();
