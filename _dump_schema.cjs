const dotenv = require('dotenv');
dotenv.config({ path: './backend/.env' });
const { Client } = require('pg');

(async () => {
  const c = new Client(process.env.DATABASE_URL);
  await c.connect();

  // 1) All tables
  const tables = await c.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const output = [];

  for (const { table_name } of tables.rows) {
    // columns
    const cols = await c.query(`
      SELECT column_name, data_type, is_nullable, column_default, 
             character_maximum_length, numeric_precision
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [table_name]);

    // constraints (PK, FK, UNIQUE)
    const constraints = await c.query(`
      SELECT tc.constraint_name, tc.constraint_type, 
             kcu.column_name,
             ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
      WHERE tc.table_schema = 'public' AND tc.table_name = $1
      ORDER BY tc.constraint_type, kcu.column_name
    `, [table_name]);

    // indexes
    const indexes = await c.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE schemaname = 'public' AND tablename = $1
      ORDER BY indexname
    `, [table_name]);

    output.push(`-- ========================================`);
    output.push(`-- TABLE: ${table_name}`);
    output.push(`-- ========================================`);
    output.push(`CREATE TABLE ${table_name} (`);

    const colLines = cols.rows.map(col => {
      let line = `  ${col.column_name} ${col.data_type.toUpperCase()}`;
      if (col.character_maximum_length) line += `(${col.character_maximum_length})`;
      if (col.is_nullable === 'NO') line += ' NOT NULL';
      if (col.column_default) line += ` DEFAULT ${col.column_default}`;
      return line;
    });
    output.push(colLines.join(',\n'));
    output.push(`);\n`);

    // Constraints
    const pks = constraints.rows.filter(c => c.constraint_type === 'PRIMARY KEY');
    const fks = constraints.rows.filter(c => c.constraint_type === 'FOREIGN KEY');
    const uqs = constraints.rows.filter(c => c.constraint_type === 'UNIQUE');

    if (pks.length) {
      const pkCols = [...new Set(pks.map(p => p.column_name))].join(', ');
      output.push(`ALTER TABLE ${table_name} ADD PRIMARY KEY (${pkCols});`);
    }
    for (const fk of fks) {
      output.push(`ALTER TABLE ${table_name} ADD CONSTRAINT ${fk.constraint_name} FOREIGN KEY (${fk.column_name}) REFERENCES ${fk.foreign_table}(${fk.foreign_column});`);
    }
    for (const uq of uqs) {
      output.push(`ALTER TABLE ${table_name} ADD CONSTRAINT ${uq.constraint_name} UNIQUE (${uq.column_name});`);
    }

    // Indexes (skip pkey indexes)
    const customIndexes = indexes.rows.filter(i => !i.indexname.endsWith('_pkey'));
    for (const idx of customIndexes) {
      output.push(idx.indexdef + ';');
    }

    output.push('');
  }

  const fs = require('fs');
  fs.writeFileSync('./ksprodb.sql', output.join('\n'), 'utf8');
  console.log(`Done! ${tables.rows.length} tables dumped to ksprodb.sql`);
  await c.end();
})();
