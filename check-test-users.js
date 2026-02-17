
import { pool } from './backend/db.js';

async function checkUsers() {
    try {
        const res = await pool.query("SELECT id, email, name, country FROM users WHERE email IN ('bugrabenturk@gmail.com', 'fernando@plannivo.com', 'suleymanince@gmail.com')");
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

checkUsers();
