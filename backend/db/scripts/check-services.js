import { pool } from '../../db.js';

async function checkPrivateLessons() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking Private Lesson Services...\n');
    
    // Check all services with 'private' in the name
    const privateQuery = await client.query(`
      SELECT id, name, max_participants, category, price 
      FROM services 
      WHERE name ILIKE '%private%' 
      ORDER BY name
    `);
    
    console.log('Private Lesson Services:');
    console.table(privateQuery.rows);
    
    // Check all services with max_participants = 1
    const singleParticipantQuery = await client.query(`
      SELECT id, name, max_participants, category, price 
      FROM services 
      WHERE max_participants = 1 
      ORDER BY name
    `);
    
    console.log('\nServices with max_participants = 1:');
    console.table(singleParticipantQuery.rows);
    
    // Check services with NULL max_participants
    const nullParticipantQuery = await client.query(`
      SELECT id, name, max_participants, category, price 
      FROM services 
      WHERE max_participants IS NULL 
      ORDER BY name
    `);
    
    console.log('\nServices with NULL max_participants:');
    console.table(nullParticipantQuery.rows);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkPrivateLessons();
