const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function run() {
  const allBookCols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='bookings' ORDER BY ordinal_position`
  );
  console.log('All booking columns:', allBookCols.rows.map(r=>r.column_name));

  const allRentalCols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='rentals' ORDER BY ordinal_position`
  );
  console.log('All rental columns:', allRentalCols.rows.map(r=>r.column_name));

  pool.end();
}
run().catch(e => { console.error(e); pool.end(); });
