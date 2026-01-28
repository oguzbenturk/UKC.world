import { pool } from './db.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function applyMigration() {
  const client = await pool.connect();
  try {
    console.log('Applying migration 116: Fix service_id column type...');
    
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '116_fix_quick_links_service_id_type.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf-8');
    
    // Execute migration
    await client.query(migrationSQL);
    
    console.log('✓ Migration 116 applied successfully!');
    console.log('✓ service_id column changed from INTEGER to UUID');
    
    // Verify the change
    const { rows } = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'quick_links' AND column_name = 'service_id'
    `);
    
    if (rows.length > 0) {
      console.log('\nVerification:');
      console.log(`  service_id type: ${rows[0].data_type}`);
    }
    
  } catch (error) {
    console.error('Error applying migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration();
