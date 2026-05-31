// Verifies the booking_charge_adjustment double-count fix on local DB.
// Expectation after fix: fetchTransactions returns ONE row for Rifat's booking
// (booking_charge with folded amount -120), NOT two rows summing to -50.
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load backend/.env so DATABASE_URL is set for the imported walletService.
const envPath = path.resolve(__dirname, '..', 'backend', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const { fetchTransactions } = await import('../backend/services/walletService.js');

const USER_ID = '44435ecc-1809-48d1-ba4b-c355be99016b';

const rows = await fetchTransactions(USER_ID, { limit: 50 });

console.log(`\nfetchTransactions returned ${rows.length} row(s):\n`);
for (const r of rows) {
  console.log(`  ${r.transaction_type.padEnd(28)} status=${r.status.padEnd(10)} amount=${String(r.amount).padStart(10)}  available_delta=${String(r.available_delta).padStart(10)}`);
}

const sumAmount = rows.reduce((acc, r) => acc + Number.parseFloat(r.amount), 0);
console.log(`\nSum of displayed amounts: ${sumAmount.toFixed(4)}`);
console.log(`Expected (matches wallet balance): -120.0000`);

const adjustmentRows = rows.filter((r) => r.transaction_type === 'booking_charge_adjustment');
const bookingChargeRow = rows.find((r) => r.transaction_type === 'booking_charge');

const checks = [];
checks.push(['No standalone booking_charge_adjustment rows', adjustmentRows.length === 0]);
checks.push(['booking_charge row exists', !!bookingChargeRow]);
checks.push(['booking_charge folded amount is -120', bookingChargeRow && Number.parseFloat(bookingChargeRow.amount) === -120]);
checks.push(['Sum equals wallet balance -120', Math.abs(sumAmount - -120) < 0.0001]);

console.log('\nChecks:');
let allPass = true;
for (const [label, ok] of checks) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) allPass = false;
}

process.exit(allPass ? 0 : 1);
