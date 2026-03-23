const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

pool.query(
  'DELETE FROM wallet_transactions WHERE id = $1',
  ['0090d0ea-35ca-493a-b81e-4180967ef9e5']
).then(function(r) {
  console.log('Deleted rows:', r.rowCount);
  return pool.end();
}).catch(function(e) {
  console.error(e.message);
  process.exit(1);
});
