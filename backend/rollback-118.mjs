/**
 * Rollback migration 118 if it failed midway
 */

import { pool } from './db.js';
import fs from 'fs/promises';
import path from 'path';

async function rollbackMigration118() {
  const rollbackSQL = await fs.readFile(
    path.join(process.cwd(), 'db/migrations/118_rollback.sql'),
    'utf-8'
  );

  console.log('Rolling back migration 118...');
  
  try {
    await pool.query(rollbackSQL);
    console.log('✅ Migration 118 rolled back successfully');
  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

rollbackMigration118();
