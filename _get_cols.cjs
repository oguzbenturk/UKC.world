const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });
pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='wallet_transactions'").then(function(r) {
  console.log(r.rows.map(function(x) { return x.column_name; }).join(', '));
  pool.end();
}).catch(function(e) {
  console.error(e.message);
  pool.end();
});
