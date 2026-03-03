import { pool } from './backend/db.js';
const r = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'event%'`);
console.log(r.rows);
const r2 = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='event_registrations' ORDER BY ordinal_position`);
console.log('event_registrations columns:', r2.rows);
const r3 = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='events' AND column_name IN ('start_at','end_at','image_url','status') ORDER BY column_name`);
console.log('events relevant columns:', r3.rows);
process.exit();
