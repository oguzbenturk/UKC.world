import { pool } from './db.js';

async function checkAndCreateEventsTable() {
  try {
    // Check if events table exists
    const checkQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'events'
      );
    `;
    
    const { rows } = await pool.query(checkQuery);
    const exists = rows[0].exists;
    
    console.log('Events table exists:', exists);
    
    if (!exists) {
      console.log('Creating events table...');
      
      const createQuery = `
        BEGIN;

        CREATE TABLE events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          event_type VARCHAR(32) NOT NULL DEFAULT 'other',
          start_at TIMESTAMPTZ NOT NULL,
          end_at TIMESTAMPTZ,
          location TEXT,
          description TEXT,
          status VARCHAR(16) NOT NULL DEFAULT 'scheduled',
          capacity INTEGER,
          price NUMERIC(10,2),
          currency VARCHAR(8),
          created_by UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX idx_events_start_at ON events(start_at);
        CREATE INDEX idx_events_status ON events(status);
        CREATE INDEX idx_events_event_type ON events(event_type);

        COMMIT;
      `;
      
      await pool.query(createQuery);
      console.log('✅ Events table created successfully!');
    } else {
      console.log('✅ Events table already exists.');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkAndCreateEventsTable();
