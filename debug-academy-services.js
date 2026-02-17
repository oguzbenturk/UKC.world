
import { pool } from './backend/db.js';

async function checkServices() {
  try {
    console.log('--- Checking Standalone Services (No Package ID) ---');
    
    const query = `
      SELECT id, name, category, discipline_tag, duration, price, package_id
      FROM services
      WHERE package_id IS NULL AND deleted_at IS NULL
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
        
        if (text.includes('kite') && !text.includes('wing') && !text.includes('foil')) matches.push('KITE'); 
        if (text.includes('wing')) matches.push('WING');
        // Check foil logic
        const isWing = text.includes('wing');
        const isEfoil = text.includes('e-foil') || text.includes('efoil') || text.includes('electric');
        if ((text.includes('foil') || text.includes('kite foil')) && !isWing && !isEfoil) matches.push('FOIL');
        if (isEfoil) matches.push('E-FOIL');

        if (matches.length === 0) matches.push('GENERIC (Should show everywhere)');
        
        console.log(`> "${s.name}" would appear in: [${matches.join(', ')}]`);
    });

  } catch (error) {
    console.error('Error querying database:', error);
  } finally {
    pool.end();
  }
}

checkServices();
