/**
 * Emergency cleanup: deletes seed users from the archived manifest.
 * Used when seed-rollback.mjs couldn't delete users (e.g. backend was down or had a bug).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = process.env.API_URL || 'http://localhost:4000/api';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(method, path, body, token) {
  const url = `${API}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  // Find the most recent rolled-back manifest
  const scripts = resolve(__dirname);
  const files = readdirSync(scripts)
    .filter(f => f.startsWith('seed-manifest.rolled-back') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    // Also check for live manifest
    const live = resolve(scripts, 'seed-manifest.json');
    try { readFileSync(live); files.push('seed-manifest.json'); } catch {}
  }

  if (files.length === 0) {
    console.error('❌ No manifest found. Nothing to clean up.');
    process.exit(1);
  }

  const manifestFile = files[0];
  console.log(`📋 Using manifest: ${manifestFile}`);
  const manifest = JSON.parse(readFileSync(resolve(scripts, manifestFile), 'utf-8'));

  const userIds = manifest.userIds || [];
  const cpIds = manifest.customerPackageIds || [];
  const bookingIds = manifest.bookingIds || [];
  const rentalIds = manifest.rentalIds || [];
  const pkgDefId = manifest.createdPackageDefinition;

  console.log(`   Users: ${userIds.length}, Packages: ${cpIds.length}, Bookings: ${bookingIds.length}, Rentals: ${rentalIds.length}\n`);

  // Login
  console.log('🔑 Logging in as admin...');
  const loginRes = await api('POST', '/auth/login', { email: 'admin@plannivo.com', password: 'asdasd35' });
  if (!loginRes.ok) { console.error('❌ Login failed:', loginRes.data); process.exit(1); }
  const token = loginRes.data.token;
  console.log('   ✅ Logged in\n');

  let errors = 0;

  // Delete bookings
  for (const id of bookingIds) {
    const r = await api('DELETE', `/bookings/${id}`, { reason: 'Seed cleanup' }, token);
    if (!r.ok && r.status !== 404) { console.log(`   ⚠️  Booking ${id}: ${r.status}`); errors++; }
    await sleep(30);
  }
  if (bookingIds.length) console.log(`✅ ${bookingIds.length} bookings deleted`);

  // Delete rentals
  for (const id of rentalIds) {
    const r = await api('DELETE', `/rentals/${id}`, null, token);
    if (!r.ok && r.status !== 404) { console.log(`   ⚠️  Rental ${id}: ${r.status}`); errors++; }
    await sleep(30);
  }
  if (rentalIds.length) console.log(`✅ ${rentalIds.length} rentals deleted`);

  // Delete customer packages
  for (const id of cpIds) {
    const r = await api('DELETE', `/services/customer-packages/${id}`, null, token);
    if (!r.ok && r.status !== 404) { console.log(`   ⚠️  Customer package ${id}: ${r.status}`); errors++; }
    await sleep(30);
  }
  if (cpIds.length) console.log(`✅ ${cpIds.length} customer packages deleted`);

  // Delete users
  console.log(`\n🗑️  Deleting ${userIds.length} users...`);
  let deleted = 0;
  for (let i = 0; i < userIds.length; i++) {
    const id = userIds[i];
    const r = await api('DELETE', `/users/${id}?hardDelete=true&deleteAllData=true`, null, token);
    if (r.ok || r.status === 404) {
      deleted++;
    } else {
      console.log(`   ⚠️  User ${id}: ${r.status} — ${JSON.stringify(r.data).substring(0,120)}`);
      errors++;
    }
    if ((i + 1) % 10 === 0) console.log(`   ${i + 1}/${userIds.length}...`);
    await sleep(50);
  }
  console.log(`✅ ${deleted}/${userIds.length} users deleted`);

  // Delete package definition
  if (pkgDefId) {
    const r = await api('DELETE', `/services/packages/${pkgDefId}/force`, null, token);
    if (r.ok || r.status === 404) {
      console.log(`✅ Package definition ${pkgDefId} deleted`);
    } else {
      console.log(`   ⚠️  Package def: ${r.status} — ${JSON.stringify(r.data).substring(0,120)}`);
      errors++;
    }
  }

  console.log('\n═══════════════════════════════════════════');
  if (errors === 0) {
    console.log('✅ CLEANUP COMPLETE — all seed data removed.');
  } else {
    console.log(`⚠️  CLEANUP COMPLETE with ${errors} error(s). Check output above.`);
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
