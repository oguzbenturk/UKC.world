const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ksprodb' });
p.query("SELECT DISTINCT lesson_category FROM instructor_category_rates ORDER BY lesson_category")
  .then(r => {
    r.rows.forEach(s => console.log(s.lesson_category));
    p.end();
  })
  .catch(e => { console.error(e); p.end(); });
