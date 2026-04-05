/**
 * fix-lessons-completed.mjs
 * Updates all bookings with status 'confirmed' to 'completed'.
 * Run: node tests/scripts/fix-lessons-completed.mjs
 */
import 'dotenv/config';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://plannivo:WHMgux86@localhost:5432/plannivo';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

try {
  const { rowCount: before } = await pool.query(
    `SELECT 1 FROM bookings WHERE status = 'confirmed' AND deleted_at IS NULL`
  );
  console.log(`Found ${before} lessons with status 'confirmed'`);

  const { rowCount } = await pool.query(
    `UPDATE bookings SET status = 'completed' WHERE status = 'confirmed' AND deleted_at IS NULL`
  );
  console.log(`✅ Updated ${rowCount} lessons from 'confirmed' → 'completed'`);
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
