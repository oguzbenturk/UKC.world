import { pool } from './db.js';
import fs from 'fs';

async function runMigration() {
  try {
    const sql = fs.readFileSync('./migrations/114_create_quick_links.sql', 'utf8');
    await pool.query(sql);
    console.log('✅ Migration 114 applied successfully');
    
    // Register in migrations table
    await pool.query(`
      INSERT INTO migrations (name, applied_at, checksum) 
      VALUES ('114_create_quick_links.sql', NOW(), 'manual')
      ON CONFLICT (name) DO NOTHING
    `);
    console.log('✅ Migration registered in migrations table');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
