// Restore marketing, links, vouchers, and forms from backup
const fs = require('fs');
const { pool } = require('./db');

const BACKUP_PATH = './backups/db_backup_2026-03-12T06-50-56.json';

// Tables to restore in dependency order
const RESTORE_TABLES = [
  'marketing_campaigns',
  'voucher_codes',
  'form_templates',
  'form_template_versions',
  'form_steps',
  'form_fields',
  'quick_links',            // after form_templates (FK: form_template_id)
  'quick_link_registrations',
  'form_submissions',       // after quick_links (FK: quick_link_id)
  'form_email_notifications',
  'form_email_logs',
  'form_analytics_events',  // after quick_links (FK: quick_link_id)
  'form_quick_action_tokens',
];

async function getTableColumns(table) {
  const res = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    [table]
  );
  return res.rows.map(r => r.column_name);
}

async function restore() {
  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));

  let totalRestored = 0;

  for (const table of RESTORE_TABLES) {
    const rows = backup.tables[table];
    if (!rows || rows.length === 0) {
      console.log(`  ${table}: no data in backup, skipping`);
      continue;
    }

    // Only use columns that exist in the current DB schema
    const dbColumns = await getTableColumns(table);
    const backupColumns = Object.keys(rows[0]);
    const columns = backupColumns.filter(c => dbColumns.includes(c));

    if (columns.length === 0) {
      console.log(`  ${table}: no matching columns, skipping`);
      continue;
    }

    const skippedCols = backupColumns.filter(c => !dbColumns.includes(c));
    if (skippedCols.length > 0) {
      console.log(`  ${table}: skipping columns not in DB: ${skippedCols.join(', ')}`);
    }

    let inserted = 0;
    let errors = 0;
    for (const row of rows) {
      const values = columns.map(c => {
        const v = row[c];
        // Convert plain objects/arrays to JSON strings for jsonb columns
        if (v !== null && typeof v === 'object') return JSON.stringify(v);
        return v;
      });
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const colNames = columns.map(c => `"${c}"`).join(', ');

      try {
        await pool.query(
          `INSERT INTO ${table} (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values
        );
        inserted++;
      } catch (err) {
        errors++;
        if (errors <= 2) console.error(`  ${table}: error - ${err.message.substring(0, 200)}`);
      }
    }

    console.log(`  ${table}: ${inserted}/${rows.length} rows restored${errors ? ` (${errors} errors)` : ''}`);
    totalRestored += inserted;
  }

  console.log(`\nDone! ${totalRestored} total rows restored.`);
  pool.end();
}

restore().catch(err => { console.error('Fatal:', err); pool.end(); });
