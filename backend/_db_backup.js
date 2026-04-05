import { pool } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================
// DATABASE BACKUP SCRIPT
// Exports all table data to a timestamped JSON file
// Run BEFORE _db_reset.js
// ============================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.join(__dirname, 'backups');

async function main() {
  const client = await pool.connect();

  try {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║         DATABASE BACKUP — Starting...            ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    // Get all tables
    const { rows: tables } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const backup = {
      timestamp: new Date().toISOString(),
      tables: {},
      metadata: {
        totalTables: tables.length,
        totalRows: 0,
      }
    };

    for (const { table_name } of tables) {
      const { rows } = await client.query(`SELECT * FROM "${table_name}"`);
      backup.tables[table_name] = rows;
      backup.metadata.totalRows += rows.length;

      if (rows.length > 0) {
        console.log(`  ✓ ${table_name}: ${rows.length} rows`);
      }
    }

    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `db_backup_${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));

    const sizeMB = (fs.statSync(filepath).size / 1024 / 1024).toFixed(2);

    console.log(`\n╔══════════════════════════════════════════════════╗`);
    console.log(`║       ✓ BACKUP COMPLETE                          ║`);
    console.log(`╚══════════════════════════════════════════════════╝`);
    console.log(`  File: ${filepath}`);
    console.log(`  Size: ${sizeMB} MB`);
    console.log(`  Tables: ${backup.metadata.totalTables}`);
    console.log(`  Rows: ${backup.metadata.totalRows}`);
    console.log(`\n  To restore: node _db_restore.js "${filename}"`);

  } catch (err) {
    console.error('\nBACKUP ERROR:', err.message);
    console.error(err.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
