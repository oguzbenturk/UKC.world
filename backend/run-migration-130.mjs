import { pool } from './db.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  try {
    const sql = fs.readFileSync(join(__dirname, 'migrations', '130_create_legal_documents.sql'), 'utf8');
    
    await pool.query(sql);
    
    console.log('✅ Migration 130_create_legal_documents.sql completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
