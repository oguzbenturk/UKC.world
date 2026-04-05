#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../backend/.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  // All users (including soft-deleted)
  const { rows: users } = await client.query(`
    SELECT u.id, u.first_name, u.last_name, u.email, r.name AS role, u.deleted_at
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    ORDER BY u.created_at DESC
    LIMIT 40
  `);
  console.log(`\nAll users (incl. deleted): ${users.length}\n`);
  for (const u of users) {
    const del = u.deleted_at ? ' [DELETED]' : '';
    console.log(`  ${u.id.slice(0,8)}  ${u.first_name} ${u.last_name} (${u.email}) [${u.role}]${del}`);
  }

  // Rentals with owner status
  const { rows: rentals } = await client.query(`
    SELECT r.id, r.user_id, u.first_name, u.last_name, u.deleted_at as user_deleted, r.status, r.start_date
    FROM rentals r
    LEFT JOIN users u ON u.id = r.user_id
    ORDER BY r.created_at DESC LIMIT 10
  `);
  console.log(`\nRentals: ${rentals.length}`);
  for (const r of rentals) {
    const owner = r.first_name ? `${r.first_name} ${r.last_name}${r.user_deleted ? ' [DELETED]' : ''}` : 'NO USER';
    console.log(`  ${r.id.slice(0,8)}  owner: ${owner}  status: ${r.status}  ${r.start_date}`);
  }

  // Wallet transactions by owner
  const { rows: wt } = await client.query(`
    SELECT wt.user_id, u.first_name, u.last_name, u.deleted_at as user_deleted,
           COUNT(*) as count, SUM(wt.amount) as total
    FROM wallet_transactions wt
    LEFT JOIN users u ON u.id = wt.user_id
    GROUP BY wt.user_id, u.first_name, u.last_name, u.deleted_at
    ORDER BY total DESC
  `);
  console.log(`\nWallet balances by user:`);
  for (const t of wt) {
    const name = t.first_name ? `${t.first_name} ${t.last_name}${t.user_deleted ? ' [DELETED]' : ''}` : 'NO USER';
    console.log(`  ${t.user_id?.slice(0,8) ?? '?'}  ${name}  ${t.count} txns  total: €${parseFloat(t.total).toFixed(2)}`);
  }

} finally {
  client.release();
  await pool.end();
}
