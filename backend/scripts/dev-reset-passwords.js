/**
 * Reset dev passwords after db:sync overwrites them with production hashes.
 * Run: npm run dev:reset-passwords
 */

import bcrypt from 'bcrypt';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const DEV_PASSWORD = process.env.DEV_RESET_PASSWORD || 'dev-default-123';

const ACCOUNTS = [
  'admin@plannivo.com',
  'ozibenturk@gmail.com',
  'test123@gmail.com',
  'alikirmizi@plannivo.com',
  'ardasimsek@plannivo.com',
  'berkehorasanli@plannivo.com',
  'dinceryazgan@plannivo.com',
  'elifsari@plannivo.com',
  'kemalfurkan@plannivo.com',
  'maleklaroussi@plannivo.com',
  'mertkinali@plannivo.com',
  'sashaantonioli@plannivo.com',
  'siyabendsanli@plannivo.com',
  'ufukgurbuz@plannivo.com',
].map(email => ({ email, password: DEV_PASSWORD }));

console.log('Resetting dev passwords...\n');

let updated = 0;
let skipped = 0;

for (const account of ACCOUNTS) {
  const hash = await bcrypt.hash(account.password, 10);
  const result = await pool.query(
    `UPDATE users
     SET password_hash = $1,
         failed_login_attempts = 0,
         account_locked = false,
         account_locked_at = NULL
     WHERE email = $2 AND deleted_at IS NULL
     RETURNING email`,
    [hash, account.email]
  );

  if (result.rows.length > 0) {
    console.log(`  ✓  ${account.email}  →  ${account.password}`);
    updated++;
  } else {
    console.log(`  -  ${account.email}  (not found, skipped)`);
    skipped++;
  }
}

await pool.end();
console.log(`\nDone. ${updated} updated, ${skipped} skipped.`);
