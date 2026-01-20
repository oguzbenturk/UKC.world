import { pool } from './db.js';

async function addImageColumnToEvents() {
  try {
    const query = `
      ALTER TABLE events 
      ADD COLUMN IF NOT EXISTS image_url TEXT;
    `;
    
    await pool.query(query);
    console.log('✅ Added image_url column to events table');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

addImageColumnToEvents();
