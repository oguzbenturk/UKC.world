import { pool } from './db.js';

async function applyMigration() {
  const client = await pool.connect();
  try {
    console.log('Applying migration for gradient_opacity...');
    
    // Add gradient_opacity column
    await client.query(`
      ALTER TABLE member_offerings 
      ADD COLUMN IF NOT EXISTS gradient_opacity INTEGER DEFAULT 70
    `);
    console.log('✓ Added gradient_opacity column');

    console.log('Migration applied successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

applyMigration();
