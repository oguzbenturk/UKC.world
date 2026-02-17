
import { pool } from './backend/db.js';

async function update() {
    try {
        console.log('Updating Suleyman to Turkey...');
        await pool.query("UPDATE users SET country = 'Turkey' WHERE email = 'suleymanince@gmail.com'");
        
        console.log('Verifying...');
        const res = await pool.query("SELECT id, email, name, country FROM users WHERE email IN ('suleymanince@gmail.com', 'fernando@plannivo.com')");
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

update();
