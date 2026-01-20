import { pool } from './db.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkMissingMigrations() {
  try {
    console.log('🔍 Checking for unapplied migrations...\n');
    
    // Get all migration files
    const migrationsDir = path.join(__dirname, 'db', 'migrations');
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files
      .filter(f => f.endsWith('.sql') && !f.startsWith('DISABLED_'))
      .sort();
    
    console.log(`📁 Found ${sqlFiles.length} migration files in db/migrations/`);
    
    // Get applied migrations
    const result = await pool.query(`
      SELECT filename FROM schema_migrations ORDER BY applied_at
    `);
    
    const appliedMigrations = new Set(result.rows.map(r => r.filename));
    console.log(`✅ ${appliedMigrations.size} migrations already applied\n`);
    
    // Find unapplied
    const unappliedMigrations = sqlFiles.filter(f => !appliedMigrations.has(f));
    
    if (unappliedMigrations.length === 0) {
      console.log('✨ All migrations are up to date!');
    } else {
      console.log(`⚠️  ${unappliedMigrations.length} migrations NOT yet applied:\n`);
      unappliedMigrations.forEach((file, idx) => {
        const isOurs = file.match(/^(017|018|019|020|021|022|023)_/);
        console.log(`  ${isOurs ? '✨' : '  '} ${idx + 1}. ${file}`);
      });
      
      console.log('\n💡 These migrations will be applied next time the backend server starts.');
      console.log('   Make sure RUN_DB_MIGRATIONS=true in backend/.env');
    }
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkMissingMigrations();
