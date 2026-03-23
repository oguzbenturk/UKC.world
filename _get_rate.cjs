const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });
// Bloody Mary's users.balance was incorrectly set to 77241.27 (TRY amount) by our fix script.
// The customer list backend now handles TRY→EUR conversion from wallet_balances directly,
// so users.balance should be 0 for TRY-wallet users (no EUR mirror).
pool.query("UPDATE users SET balance = 0, updated_at = NOW() WHERE id = $1 RETURNING id, balance", ['21764418-1ab1-482b-9b60-5332ee919e91']).then(function(r) {
  console.log('Fixed users.balance:', JSON.stringify(r.rows));
  pool.end();
}).catch(function(e) { console.error(e.message); pool.end(); });
