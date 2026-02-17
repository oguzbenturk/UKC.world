
import { pool } from './backend/db.js';

async function checkServices() {
  try {
    console.log('--- DB Schema Check ---');
    const schemaRes = await pool.query('SELECT * FROM services LIMIT 1');
    if (schemaRes.rows.length > 0) {
        console.log('Columns:', Object.keys(schemaRes.rows[0]).join(', '));
    } else {
        console.log('Table is empty, cannot infer columns.');
    }

    console.log('\n--- Checking Standalone Services ---');
    
    // Updated query based on likely columns (removed deleted_at and duration_minutes)
    const query = `
      SELECT id, name, category, discipline_tag, duration, price, package_id
      FROM services
      WHERE package_id IS NULL
      ORDER BY name ASC
    `;
    
    const { rows } = await pool.query(query);
    
    if (rows.length === 0) {
      console.log('No services found!');
    } else {
      console.log(`Found ${rows.length} services:`);
      rows.forEach(s => {
        console.log(`[${s.id}] Name: "${s.name}" | Cat: "${s.category}" | Tag: "${s.discipline_tag}" | Dur: ${JSON.stringify(s.duration)} | Price: ${s.price}`);
      });
    }

    console.log('\n--- Checking Filter Logic Simulation ---');
    // Simulate the logic we have in the frontend
    const normalize = (v) => String(v || '').toLowerCase();
    
    rows.forEach(s => {
        const text = (s.name + ' ' + (s.category || '') + ' ' + (s.discipline_tag || '')).toLowerCase();
        let matches = [];
        
        // Exact matches first
        if (text.includes('kite') && !text.includes('wing') && !text.includes('foil')) matches.push('KITE'); 
        
        const isWing = text.includes('wing');
        if (isWing) matches.push('WING');

        // Check foil logic
        const isEfoil = text.includes('e-foil') || text.includes('efoil') || text.includes('electric');
        
        // Foil page logic: Must have 'foil', NOT be wing, NOT be efoil
        if ((text.includes('foil') || text.includes('kite foil')) && !isWing && !isEfoil) matches.push('FOIL');
        
        if (isEfoil) matches.push('E-FOIL');

        // GENERIC logic
        const mentionsAnyDiscipline = ['kite', 'wing', 'foil', 'efoil', 'electric'].some(d => text.includes(d));
        if (!mentionsAnyDiscipline) matches.push('GENERIC (Shows Everywhere)');
        
        console.log(`> "${s.name}" would appear in: [${matches.join(', ')}]`);
    });

  } catch (error) {
    console.error('Error querying database:', error);
  } finally {
    pool.end();
  }
}

checkServices();
