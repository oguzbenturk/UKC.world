import { pool } from './db.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  try {
    const sql = fs.readFileSync(join(__dirname, 'migrations', '131_populate_legal_documents.sql'), 'utf8');
    
    await pool.query(sql);
    
    console.log('✅ Migration 131_populate_legal_documents.sql completed successfully');
    console.log('Legal documents populated:');
    console.log('  - Terms of Service (Duotone Pro Center - Turkey)');
    console.log('  - Privacy Policy (KVKK Compliant)');
    console.log('  - Marketing Preferences');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();

