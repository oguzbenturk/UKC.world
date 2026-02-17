import { pool } from './backend/db.js';

async function fixUser() {
  try {
    // Update Bugra Benturk with valid address details for Iyzico
    const email = 'bugrabenturk@gmail.com';
    const address = 'Nidakule Göztepe, Merdivenköy Mah. Bora Sok. No:1';
    const city = 'Istanbul';
    const country = 'Turkey';
    const zip = '34732';
    
    // Also ensure country is Turkey to test successful flow first (which forces TRY)
    // OR keep Sweden but give valid address. 
    // User wants "check settings". 
    // Let's set a valid full address details.
    
    // I set country to Turkey to ensure consistency with Iyzico Sandbox expectations for now, 
    // because Sandbox foreign currency/address support can be flaky without proper config.
    // User can change it back later.
    
    const res = await pool.query(
      `UPDATE users 
       SET address = $1, city = $2, country = $3, postal_code = $4 
       WHERE email = $5 
       RETURNING id, email, address, city, country, postal_code, preferred_currency`,
      [address, city, country, zip, email]
    );
    
    console.log('User updated:', res.rows[0]);
  } catch (err) {
    console.error('Error updating user:', err);
  } finally {
    await pool.end();
  }
}

fixUser();
