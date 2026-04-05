/* Verify required columns exist on booking_participants in the active DB */
import pg from 'pg';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend .env (points to your production DB as per your setup)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  try {
    const sql = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'booking_participants'
        AND column_name IN ('package_hours_used','cash_hours_used')
      ORDER BY column_name;
    `;
    const { rows } = await pool.query(sql);
    const cols = rows.map(r => r.column_name);
    console.log(JSON.stringify({ ok: true, columns: cols }));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e.message }));
    throw e;
  } finally {
    await pool.end();
  }
})();
