const pg = require('pg');
const pool = new pg.Pool({ connectionString: 'postgresql://plannivo:WHMgux86@plannivo.com:5432/plannivo' });

pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position`)
  .then(r => {
    console.log('Users table columns:');
    r.rows.forEach(c => console.log('  -', c.column_name, ':', c.data_type));
    pool.end();
  })
  .catch(e => { console.error(e); pool.end(); });
