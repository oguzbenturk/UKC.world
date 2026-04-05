#!/usr/bin/env node
/**
 * Elif Sarı – Full Package Booking Test
 *
 * Creates a random German customer, funds wallet, purchases a 10 h private
 * package, books all hours with Elif Sarı, books 3 h of non-package private
 * lessons (1 h + 2 h), then verifies commissions, earnings, balances and wallet.
 *
 * Usage:   node tests/scripts/elif-booking-test.mjs
 * Cleanup: node tests/scripts/cleanup.mjs
 */

import {
  API, PASSWORD, ADMIN_EMAIL, PROFILES, ELIF_ID,
  PKG_SERVICE_PACKAGE_ID, PKG_NAME, PKG_PRICE, PKG_TOTAL_HOURS,
  PRIVATE_LESSON_SERVICE_ID, PRIVATE_LESSON_PRICE,
  PKG_SESSIONS, NON_PKG_SESSIONS,
  log, ok, fail, title,
  api, apiOk, shuffle, adminLogin,
} from '../_shared.mjs';

// Random base offset (60–300 days out) so each run gets unique time slots
const DATE_BASE_OFFSET = 60 + Math.floor(Math.random() * 240);
function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + DATE_BASE_OFFSET + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// ── Main ───────────────────────────────────────────────────────────
let totalTests  = 0;
let passedTests = 0;

function assert(condition, label) {
  totalTests++;
  if (condition) { passedTests++; ok(label); }
  else { fail(label); }
}

async function main() {
  title('BOOKING FLOW – E2E TEST');

  // ──────────── 1. Admin Login ────────────
  title('1 · Admin Login');
  const token = await adminLogin();
  ok('Logged in as admin');

  // ──────────── 2. Fetch Roles & Instructors ────────────
  title('2 · Fetching roles & instructors');
  const roles = await apiOk('GET', '/roles', null, token);
  const studentRole = (Array.isArray(roles) ? roles : roles.roles || [])
    .find(r => r.name === 'student');
  if (!studentRole) throw new Error('Student role not found');
  ok(`Student role: ${studentRole.id}`);

  const instructorList = await apiOk('GET', '/instructors', null, token);
  const allInstructors = Array.isArray(instructorList) ? instructorList : instructorList.instructors || [];
  const instructor = allInstructors.find(i => i.id === ELIF_ID);
  if (!instructor) throw new Error('Elif Sarı not found in instructor list');
  ok(`Instructor: ${instructor.first_name} ${instructor.last_name}`);

  // ──────────── 3. Create Customer ────────────
  title('3 · Creating customer');

  // Find a profile that doesn't already exist
  let profile = null;
  let userId   = null;
  const shuffledProfiles = shuffle(PROFILES);

  for (const p of shuffledProfiles) {
    const res = await api('POST', '/users', { ...p, password: PASSWORD, role_id: studentRole.id }, token);
    if (res.ok) {
      profile = p;
      userId = res.data.id || res.data.user?.id;
      break;
    }
    // 409 = email already exists – try next profile
    if (res.status === 409) continue;
    // Unexpected error
    throw new Error(`POST /users → ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
  }
  if (!profile || !userId) throw new Error('All 5 test profiles already exist. Delete one first.');
  const displayName = `${profile.first_name} ${profile.last_name}`;
  ok(`Created: ${displayName} (${profile.email}) → ${userId}`);

  // ──────────── 4. Fund Wallet → €2 500 ────────────
  title('4 · Funding wallet with €2 500');
  await apiOk('POST', '/wallet/manual-adjust', {
    userId, amount: 2500, currency: 'EUR', description: 'Test wallet funding',
  }, token);
  ok('Wallet funded: €2 500');

  // ──────────── 5. Purchase 10 h Package ────────────
  title('5 · Purchasing 10 h Rider Progression Pack (€700)');
  const cpRes = await apiOk('POST', '/services/customer-packages', {
    customerId: userId,
    servicePackageId: PKG_SERVICE_PACKAGE_ID,
    packageName: PKG_NAME,
    totalHours: PKG_TOTAL_HOURS,
    purchasePrice: PKG_PRICE,
    currency: 'EUR',
  }, token);
  const cpId = cpRes.id;
  ok(`Package assigned: ${cpId}`);
  assert(cpRes.totalHours === PKG_TOTAL_HOURS || parseFloat(cpRes.totalHours) === PKG_TOTAL_HOURS,
    `Package totalHours = ${PKG_TOTAL_HOURS}`);

  // ──────────── 6. Book Package Sessions ────────────
  // Pick ONE random instructor for all lessons in this run
  const instrName = `${instructor.first_name} ${instructor.last_name}`;
  title(`6 · Booking 10 h package lessons with ${instrName}`);

  const pkgBookings = [];
  for (let i = 0; i < PKG_SESSIONS.length; i++) {
    const dur = PKG_SESSIONS[i];
    const dateStr = futureDate(i + 1);
    const startHour = `${8 + i}.00`;

    const booking = await apiOk('POST', `/bookings?force=true`, {
      date: dateStr,
      start_hour: startHour,
      duration: dur,
      student_user_id: userId,
      instructor_user_id: instructor.id,
      service_id: PRIVATE_LESSON_SERVICE_ID,
      use_package: true,
      customer_package_id: cpId,
      status: 'confirmed',
    }, token);

    const bId = booking.id || booking.booking?.id;
    pkgBookings.push({ id: bId, duration: dur });
    ok(`Session ${i + 1}: ${dur}h on ${dateStr}`);
  }

  // Mark all package bookings as completed
  for (const b of pkgBookings) {
    await apiOk('PUT', `/bookings/${b.id}`, { status: 'completed' }, token);
  }
  ok(`All ${pkgBookings.length} sessions completed`);

  // ──────────── 7. Package Verification ────────────
  title('7 · Package status verification');
  const pkgCheck = await apiOk('GET', `/services/customer-packages/${userId}`, null, token);
  const ourPkg = (Array.isArray(pkgCheck) ? pkgCheck : pkgCheck.packages || pkgCheck.data || [])
    .find(p => p.id === cpId);
  if (ourPkg) {
    const remaining = parseFloat(ourPkg.remaining_hours ?? ourPkg.remainingHours ?? -1);
    const used      = parseFloat(ourPkg.used_hours ?? ourPkg.usedHours ?? -1);
    assert(remaining === 0, `Package remaining hours = 0 (got ${remaining})`);
    assert(used === PKG_TOTAL_HOURS, `Package used hours = ${PKG_TOTAL_HOURS} (got ${used})`);
    const st = (ourPkg.status || '').toLowerCase();
    assert(st === 'used_up' || st === 'completed' || st === 'expired', `Package status = used_up/completed (got ${st})`);
  } else {
    fail('Could not find the customer package for verification');
  }

  // ──────────── 8. Non-Package Lessons (3 h) ────────────
  title(`8 · Booking 3 h non-package lessons with ${instrName}`);
  const nonPkgBookings = [];
  for (let i = 0; i < NON_PKG_SESSIONS.length; i++) {
    const dur = NON_PKG_SESSIONS[i];
    const dateStr = futureDate(PKG_SESSIONS.length + i + 2);
    const startHour = `${8 + i}.00`;

    const booking = await apiOk('POST', `/bookings?force=true`, {
      date: dateStr,
      start_hour: startHour,
      duration: dur,
      student_user_id: userId,
      instructor_user_id: instructor.id,
      service_id: PRIVATE_LESSON_SERVICE_ID,
      status: 'confirmed',
      amount: PRIVATE_LESSON_PRICE * dur,
    }, token);

    const bId = booking.id || booking.booking?.id;
    nonPkgBookings.push({ id: bId, duration: dur });
    ok(`Lesson ${i + 1}: ${dur}h on ${dateStr}`);
  }

  for (const b of nonPkgBookings) {
    await apiOk('PUT', `/bookings/${b.id}`, { status: 'completed' }, token);
  }
  ok(`All ${nonPkgBookings.length} non-package lessons completed`);

  // ──────────── 9. Commission & Earnings Verification ────────────
  title(`9 · Commission & Earnings for ${instrName}`);

  const allBookings = [...pkgBookings, ...nonPkgBookings];
  const allBookingIds = new Set(allBookings.map(b => b.id));

  // Get commission config
  const commRes = await api('GET', `/instructor-commissions/instructors/${instructor.id}/commissions`, null, token);
  const commConfig = commRes.data?.defaultCommission || { type: 'unknown', value: 0 };
  log(`  Commission: ${commConfig.type} ${commConfig.value}${commConfig.type === 'percentage' ? '%' : '€/h'}`);

  // Get earnings
  const earningsRes = await apiOk('GET', `/finances/instructor-earnings/${instructor.id}`, null, token);
  const allEarnings = earningsRes.earnings || [];
  const ourEarnings = allEarnings.filter(e => allBookingIds.has(e.booking_id));
  const totalEarned = ourEarnings.reduce((s, e) => s + (e.total_earnings || 0), 0);

  log(`  ${allBookings.length} bookings → ${ourEarnings.length} earnings → €${totalEarned.toFixed(2)}`);

  assert(ourEarnings.length === allBookings.length,
    `${instrName}: ${allBookings.length} booking(s) → ${ourEarnings.length} earning(s)`);

  const allPositive = ourEarnings.every(e => (e.total_earnings || 0) > 0);
  assert(allPositive, `${instrName}: all earnings > €0`);

  for (const e of ourEarnings) {
    assert(e.commission_rate > 0 || e.total_earnings > 0,
      `Booking ${e.booking_id?.slice(0, 8)}: rate=${e.commission_rate}, earned=€${e.total_earnings}`);
  }

  // ──────────── 10. Instructor Balance Verification ────────────
  title(`10 · ${instrName} Balance`);
  const balances = await apiOk('GET', '/finances/instructor-balances', null, token);
  const bal = balances[instructor.id];
  assert(bal && bal.totalEarned > 0,
    `${instrName}: totalEarned = €${bal?.totalEarned ?? 'N/A'} (> 0)`);

  // ──────────── 11. Finance Summary Verification ────────────
  title('11 · Finance Summary Verification');
  const summary = await apiOk('GET', '/finances/summary?mode=accrual', null, token);
  const revenue = summary.revenue || {};

  assert(Number(revenue.total_revenue) > 0, `Total revenue > 0: €${revenue.total_revenue}`);
  assert(Number(revenue.lesson_revenue) > 0, `Lesson revenue > 0: €${revenue.lesson_revenue}`);

  const commTotal = Number(summary.netRevenue?.commission_total || 0);
  assert(commTotal > 0, `Commission total > 0: €${commTotal}`);

  // ──────────── 12. Customer Wallet Verification ────────────
  title('12 · Customer Wallet');
  const acct = await apiOk('GET', `/finances/accounts/${userId}`, null, token);
  const walletBalance = parseFloat(acct.balance ?? acct.wallet?.balance ?? 0);
  const expectedBalance = 2500 - PKG_PRICE;
  assert(Math.abs(walletBalance - expectedBalance) < 1,
    `Wallet: €${walletBalance} (expected €${expectedBalance})`);

  // ──────────── Summary ────────────
  title('TEST RESULTS');
  log(`\n  ${passedTests}/${totalTests} tests passed\n`);

  if (passedTests === totalTests) {
    log('  🎉 ALL TESTS PASSED!\n');
  } else {
    log(`  ⚠️  ${totalTests - passedTests} test(s) failed.\n`);
  }

  // Print cleanup info
  log('─'.repeat(60));
  log(`  Customer: ${displayName} (${profile.email})`);
  log(`  User ID:  ${userId}`);
  log(`  Cleanup:  node tests/scripts/cleanup.mjs`);
  log('─'.repeat(60));

  process.exit(passedTests === totalTests ? 0 : 1);
}

main().catch(e => {
  console.error('\n❌ FATAL:', e.message);
  process.exit(1);
});
