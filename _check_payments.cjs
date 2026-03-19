const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function main() {
  // Find manager user(s)
  const managers = await pool.query(`
    SELECT u.id, u.first_name, u.last_name 
    FROM users u JOIN roles r ON r.id = u.role_id 
    WHERE r.name = 'manager' AND u.deleted_at IS NULL
  `);
  console.log('Managers:', managers.rows);

  for (const mgr of managers.rows) {
    console.log(`\n=== Payments for ${mgr.first_name} ${mgr.last_name} (${mgr.id}) ===`);
    const payments = await pool.query(`
      SELECT id, amount, transaction_type, entity_type, related_entity_type, 
             description, payment_method, created_at
      FROM wallet_transactions 
      WHERE user_id = $1 AND transaction_type IN ('payment','deduction')
      ORDER BY created_at DESC LIMIT 20
    `, [mgr.id]);
    console.table(payments.rows);
  }

  await pool.end();
}
main().catch(e => { console.error(e); pool.end(); });
