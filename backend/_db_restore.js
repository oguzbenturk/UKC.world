import { pool } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================
// DATABASE RESTORE SCRIPT
// Restores all table data from a JSON backup file
// Usage: node _db_restore.js <backup_filename>
//        node _db_restore.js db_backup_2026-03-12T09-30-00.json
// Add --execute to actually restore (default is dry-run)
// ============================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.join(__dirname, 'backups');

const DRY_RUN = !process.argv.includes('--execute');

// Find backup filename from args (skip --execute)
const backupArg = process.argv.slice(2).find(a => !a.startsWith('--'));

async function main() {
  if (!backupArg) {
    // List available backups
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('db_backup_') && f.endsWith('.json'));
    if (files.length === 0) {
      console.log('No backup files found in backups/');
      process.exit(1);
    }
    console.log('Available backups:');
    for (const f of files) {
      const size = (fs.statSync(path.join(BACKUP_DIR, f)).size / 1024 / 1024).toFixed(2);
      console.log(`  ${f} (${size} MB)`);
    }
    console.log(`\nUsage: node _db_restore.js <filename> [--execute]`);
    process.exit(0);
  }

  const filepath = path.join(BACKUP_DIR, backupArg);
  if (!fs.existsSync(filepath)) {
    console.error(`Backup file not found: ${filepath}`);
    process.exit(1);
  }

  console.log(`Loading backup: ${backupArg}...`);
  const backup = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  console.log(`  Backup from: ${backup.timestamp}`);
  console.log(`  Tables: ${backup.metadata.totalTables}, Rows: ${backup.metadata.totalRows}\n`);

  if (DRY_RUN) {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║        DRY RUN MODE — No changes applied        ║');
    console.log('║   Run with --execute to apply for real           ║');
    console.log('╚══════════════════════════════════════════════════╝\n');
  } else {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   ⚠  LIVE RESTORE — Database will be replaced!  ║');
    console.log('╚══════════════════════════════════════════════════╝\n');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Disable FK checks during restore
    await client.query('SET session_replication_role = replica');

    // Get table names sorted — truncate all first, then insert
    const tableNames = Object.keys(backup.tables);

    console.log('── Truncating all tables ──');
    for (const table of tableNames) {
      await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
    }
    console.log(`  Truncated ${tableNames.length} tables\n`);

    console.log('── Restoring data ──');
    let totalRestored = 0;

    for (const table of tableNames) {
      const rows = backup.tables[table];
      if (rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const colList = columns.map(c => `"${c}"`).join(', ');

      // Batch insert 100 rows at a time
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const values = [];
        const placeholders = [];

        batch.forEach((row, batchIdx) => {
          const rowPlaceholders = columns.map((col, colIdx) => {
            values.push(row[col]);
            return `$${batchIdx * columns.length + colIdx + 1}`;
          });
          placeholders.push(`(${rowPlaceholders.join(', ')})`);
        });

        await client.query(
          `INSERT INTO "${table}" (${colList}) VALUES ${placeholders.join(', ')}`,
          values
        );
      }

      totalRestored += rows.length;
      console.log(`  ✓ ${table}: ${rows.length} rows`);
    }

    // Re-enable FK checks
    await client.query('SET session_replication_role = DEFAULT');

    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log(`\n╔══════════════════════════════════════════════════╗`);
      console.log(`║   DRY RUN COMPLETE — ${totalRestored} rows would be restored  ║`);
      console.log(`║   Run: node _db_restore.js ${backupArg} --execute ║`);
      console.log(`╚══════════════════════════════════════════════════╝`);
    } else {
      await client.query('COMMIT');
      console.log(`\n╔══════════════════════════════════════════════════╗`);
      console.log(`║       ✓ RESTORE COMPLETE — ${totalRestored} rows restored     ║`);
      console.log(`╚══════════════════════════════════════════════════╝`);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nRESTORE ERROR — Transaction rolled back:', err.message);
    console.error(err.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
