#!/usr/bin/env node
/**
 * Fix bookings that have customer_package_id but wrong payment_status
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function fix() {
  console.log('Checking for bookings with package but wrong payment_status...\n');
  
  // First, show what will be fixed
  const checkResult = await pool.query(`
    SELECT id, payment_status, customer_package_id 
    FROM bookings 
    WHERE customer_package_id IS NOT NULL 
      AND payment_status = 'paid'
  `);
  
  if (checkResult.rows.length === 0) {
    console.log('✅ No bookings need fixing!');
    await pool.end();
    return;
  }
  
  console.log(`Found ${checkResult.rows.length} bookings to fix:`);
  checkResult.rows.forEach(r => {
    console.log(`  - ${r.id} (payment_status='${r.payment_status}')`);
  });
  
  // Fix them
  const result = await pool.query(`
    UPDATE bookings 
    SET payment_status = 'package'
    WHERE customer_package_id IS NOT NULL 
      AND payment_status = 'paid'
    RETURNING id
  `);
  
  console.log(`\n✅ Fixed ${result.rowCount} bookings - set payment_status to 'package'`);
  
  await pool.end();
}

fix().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
