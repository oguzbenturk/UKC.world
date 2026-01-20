import { pool } from './db.js';

async function createEventRegistrationsTable() {
  try {
    const query = `
      BEGIN;

      -- Create event registrations table
      CREATE TABLE IF NOT EXISTS event_registrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(16) NOT NULL DEFAULT 'registered', -- registered | cancelled | attended
        registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        notes TEXT,
        UNIQUE(event_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_event_registrations_event_id ON event_registrations(event_id);
      CREATE INDEX IF NOT EXISTS idx_event_registrations_user_id ON event_registrations(user_id);
      CREATE INDEX IF NOT EXISTS idx_event_registrations_status ON event_registrations(status);

      COMMIT;
    `;
    
    await pool.query(query);
    console.log('✅ Event registrations table created successfully!');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

createEventRegistrationsTable();
