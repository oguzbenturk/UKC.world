import { pool } from './db.js';

async function applyMigration() {
  const client = await pool.connect();
  try {
    console.log('Applying migration 113...');
    
    // Add card_style column
    await client.query(`
      ALTER TABLE member_offerings 
      ADD COLUMN IF NOT EXISTS card_style VARCHAR(50) DEFAULT 'simple'
    `);
    console.log('✓ Added card_style column');

    // Add button_text column
    await client.query(`
      ALTER TABLE member_offerings 
      ADD COLUMN IF NOT EXISTS button_text VARCHAR(100) DEFAULT 'Choose Plan'
    `);
    console.log('✓ Added button_text column');

    // Add gradient_color column
    await client.query(`
      ALTER TABLE member_offerings 
      ADD COLUMN IF NOT EXISTS gradient_color VARCHAR(50)
    `);
    console.log('✓ Added gradient_color column');

    // Add text_color column
    await client.query(`
      ALTER TABLE member_offerings 
      ADD COLUMN IF NOT EXISTS text_color VARCHAR(20) DEFAULT 'dark'
    `);
    console.log('✓ Added text_color column');

    console.log('Migration 113 applied successfully!');
    
    // Verify columns
    const { rows } = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'member_offerings'
      ORDER BY ordinal_position
    `);
    console.log('Current columns:', rows.map(r => r.column_name).join(', '));
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

applyMigration();
