/**
 * Rollback Script: Undo everything created by seed-turkish-customers.mjs
 *
 * Usage:  node scripts/seed-rollback.mjs
 *
 * Reads scripts/seed-manifest.json and deletes in safe order:
 *   1. Bookings  (soft delete — auto-refunds wallet + restores package hours)
 *   2. Rentals   (hard delete — auto-refunds wallet)
 *   3. Customer Packages  (hard delete — auto-refunds remaining hours)
 *   4. Users     (hard delete with cascade via ?hardDelete=true&deleteAllData=true)
 *   5. Service definitions created by the seed (package def, rental service)
 *
 * Safe: reads the manifest — only touches entities the seed script created.
 */

import { readFileSync, existsSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(__dirname, 'seed-manifest.json');
const API = process.env.API_URL || 'http://localhost:4000/api';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── API helper ────────────────────────────────────────────────────
async function api(method, path, body, token) {
  const url = `${API}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  return { ok: res.ok, status: res.status, data };
}

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('🔄 Rollback: undoing seed-turkish-customers\n');

  // ── Load manifest ──
  if (!existsSync(MANIFEST_PATH)) {
    console.error('❌ No manifest found at', MANIFEST_PATH);
    console.error('   Run seed-turkish-customers.mjs first, or the manifest was already cleaned up.');
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  console.log(`   Manifest created: ${manifest.createdAt}`);
  console.log(`   Users: ${manifest.userIds?.length || 0}`);
  console.log(`   Packages: ${manifest.customerPackageIds?.length || 0}`);
  console.log(`   Bookings: ${manifest.bookingIds?.length || 0}`);
  console.log(`   Rentals: ${manifest.rentalIds?.length || 0}`);
  console.log(`   Created pkg def: ${manifest.createdPackageDefinition || 'none'}`);
  console.log(`   Created rental svc: ${manifest.createdRentalService || 'none'}\n`);

  // ── Admin login ──
  console.log('1️⃣  Logging in as admin...');
  const loginRes = await api('POST', '/auth/login', {
    email: 'admin@plannivo.com',
    password: 'asdasd35',
  });
  if (!loginRes.ok) {
    console.error('❌ Login failed:', loginRes.data);
    process.exit(1);
  }
  const token = loginRes.data.token;
  console.log(`   ✅ Logged in\n`);

  let errors = 0;

  // ── Step 2: Delete bookings (soft delete — refunds automatically) ──
  const bookingIds = manifest.bookingIds || [];
  if (bookingIds.length > 0) {
    console.log(`2️⃣  Deleting ${bookingIds.length} bookings...`);
    for (const id of bookingIds) {
      const res = await api('DELETE', `/bookings/${id}`, { reason: 'Seed rollback' }, token);
      if (!res.ok && res.status !== 404) {
        console.log(`   ⚠️  Booking ${id}: ${res.status}`);
        errors++;
      }
      await sleep(30);
    }
    console.log(`   ✅ Bookings deleted\n`);
  } else {
    console.log('2️⃣  No bookings to delete\n');
  }

  // ── Step 3: Delete rentals (hard delete — refunds automatically) ──
  const rentalIds = manifest.rentalIds || [];
  if (rentalIds.length > 0) {
    console.log(`3️⃣  Deleting ${rentalIds.length} rentals...`);
    for (const id of rentalIds) {
      const res = await api('DELETE', `/rentals/${id}`, null, token);
      if (!res.ok && res.status !== 404) {
        console.log(`   ⚠️  Rental ${id}: ${res.status}`);
        errors++;
      }
      await sleep(30);
    }
    console.log(`   ✅ Rentals deleted\n`);
  } else {
    console.log('3️⃣  No rentals to delete\n');
  }

  // ── Step 4: Delete customer packages (hard delete — refunds remaining) ──
  const cpIds = manifest.customerPackageIds || [];
  if (cpIds.length > 0) {
    console.log(`4️⃣  Deleting ${cpIds.length} customer packages...`);
    for (const id of cpIds) {
      const res = await api('DELETE', `/services/customer-packages/${id}`, null, token);
      if (!res.ok && res.status !== 404) {
        console.log(`   ⚠️  Customer package ${id}: ${res.status}`);
        errors++;
      }
      await sleep(30);
    }
    console.log(`   ✅ Customer packages deleted\n`);
  } else {
    console.log('4️⃣  No customer packages to delete\n');
  }

  // ── Step 5: Delete users (hard delete with cascade) ──
  const userIds = manifest.userIds || [];
  if (userIds.length > 0) {
    console.log(`5️⃣  Deleting ${userIds.length} users (hard delete + cascade)...`);
    for (let i = 0; i < userIds.length; i++) {
      const id = userIds[i];
      const res = await api('DELETE', `/users/${id}?hardDelete=true&deleteAllData=true`, null, token);
      if (!res.ok && res.status !== 404) {
        console.log(`   ⚠️  User ${id}: ${res.status} — ${typeof res.data === 'object' ? (res.data.message || res.data.error) : res.data}`);
        errors++;
      }
      if ((i + 1) % 10 === 0) console.log(`   ... ${i + 1}/${userIds.length} deleted`);
      await sleep(50);
    }
    console.log(`   ✅ Users deleted\n`);
  } else {
    console.log('5️⃣  No users to delete\n');
  }

  // ── Step 6: Delete service definitions created by the seed ──
  if (manifest.createdPackageDefinition) {
    console.log('6️⃣  Deleting seed-created package definition...');
    const res = await api('DELETE', `/services/packages/${manifest.createdPackageDefinition}`, null, token);
    if (res.ok || res.status === 404) {
      console.log('   ✅ Package definition deleted\n');
    } else {
      console.log(`   ⚠️  Package def ${manifest.createdPackageDefinition}: ${res.status}`);
      errors++;
    }
  }

  if (manifest.createdRentalService) {
    console.log('   Deleting seed-created rental service...');
    const res = await api('DELETE', `/services/${manifest.createdRentalService}`, null, token);
    if (res.ok || res.status === 404) {
      console.log('   ✅ Rental service deleted\n');
    } else {
      console.log(`   ⚠️  Rental service ${manifest.createdRentalService}: ${res.status}`);
      errors++;
    }
  }

  // ── Archive the manifest ──
  const archivePath = MANIFEST_PATH.replace('.json', `.rolled-back-${Date.now()}.json`);
  renameSync(MANIFEST_PATH, archivePath);

  console.log('═══════════════════════════════════════════════');
  if (errors === 0) {
    console.log('✅ ROLLBACK COMPLETE — all seed data removed.');
  } else {
    console.log(`⚠️  ROLLBACK COMPLETE with ${errors} error(s).`);
    console.log('   Some entities may need manual cleanup.');
  }
  console.log(`   Manifest archived: ${archivePath}`);
  console.log('═══════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
