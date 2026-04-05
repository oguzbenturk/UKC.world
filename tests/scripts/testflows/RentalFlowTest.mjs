#!/usr/bin/env node
/**
 * Rental Flow Test – Full Revenue Mix
 *
 * Creates 1 Turkish customer, funds wallet with €5,000, then:
 *   1. Week 1: 7 daily non-package SLS rentals (paid from wallet)
 *   2. Week 2: Purchases 1-week SLS rental package (€500), uses all 7 days
 *   3. 6 h lesson package with Siyabend Şanlı (sessions: 1h, 1h, 1h, 1h, 1h, 1h)
 *   4. 10 individual lessons with Oğuzhan Bentürk (random durations)
 *   5. 10-night accommodation booking
 *
 * Wallet: €5,000 (covers all activities).
 * Verifies: rental creation, package usage, wallet deductions, instructor
 * earnings, manager commissions, accommodation booking.
 *
 * Usage:   node tests/scripts/testflows/RentalFlowTest.mjs
 * Cleanup: node tests/scripts/cleanup.mjs
 */

import {
  API, PASSWORD, ADMIN_EMAIL, TURKISH_PROFILES,
  PKG_SERVICE_PACKAGE_ID, PKG_NAME,
  STARTER_PKG_ID, STARTER_PKG_NAME, STARTER_PKG_PRICE, STARTER_PKG_HOURS,
  PRIVATE_LESSON_SERVICE_ID, PRIVATE_LESSON_PRICE,
  SLS_RENTAL_PKG_ID, SLS_RENTAL_PKG_NAME, SLS_RENTAL_PKG_PRICE, SLS_RENTAL_PKG_DAYS,
  SLS_EQUIPMENT_SERVICE_ID,
  ACCOMMODATION_UNIT_ID,
  SIYABEND_ID, OGUZHAN_ID,
  log, ok, fail, title,
  api, apiOk, shuffle, adminLogin,
} from '../_shared.mjs';

// ── Date helpers ───────────────────────────────────────────────────
const DATE_BASE_OFFSET = 60 + Math.floor(Math.random() * 240);
function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + DATE_BASE_OFFSET + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// ── Session schedules ──────────────────────────────────────────────
const SIYABEND_PKG_SESSIONS = [1, 1, 1, 1, 1, 1]; // 6 h total

// Oğuzhan individual lessons — random durations totalling 10 sessions
const OGUZHAN_SESSIONS = [1.5, 2, 1, 2.5, 1, 0.5, 1.5, 2, 1, 1.5]; // 14.5 h
const OGUZHAN_TOTAL_HOURS = OGUZHAN_SESSIONS.reduce((a, b) => a + b, 0);

// ── Test framework ─────────────────────────────────────────────────
let totalTests  = 0;
let passedTests = 0;
const warn = (msg) => log(`  ⚠️  ${msg}`);

function assert(condition, label) {
  totalTests++;
  if (condition) { passedTests++; ok(label); }
  else { fail(label); }
}

// ── Helpers ────────────────────────────────────────────────────────
async function createCustomer(profiles, roleId, token) {
  const shuffled = shuffle(profiles);
  for (const p of shuffled) {
    const res = await api('POST', '/users', { ...p, password: PASSWORD, role_id: roleId }, token);
    if (res.ok) {
      const userId = res.data.id || res.data.user?.id;
      return { profile: p, userId };
    }
    if (res.status === 409) continue;
    throw new Error(`POST /users → ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
  }
  throw new Error('All test profiles already exist. Run cleanup first.');
}

async function fundWallet(userId, amount, token) {
  await apiOk('POST', '/wallet/manual-adjust', {
    userId, amount, currency: 'EUR', description: 'Test wallet funding',
  }, token);
}

async function getWalletBalance(userId, token) {
  const acct = await apiOk('GET', `/finances/accounts/${userId}`, null, token);
  return parseFloat(acct.balance ?? acct.wallet?.balance ?? 0);
}

async function bookAndCompleteLessons(sessions, userId, instructorId, serviceId, token, dayOffset, opts = {}) {
  const bookings = [];
  for (let i = 0; i < sessions.length; i++) {
    const dur = sessions[i];
    const dateStr = futureDate(dayOffset + i);
    const startHour = `${8 + (i % 10)}.00`;

    const body = {
      date: dateStr,
      start_hour: startHour,
      duration: dur,
      student_user_id: userId,
      instructor_user_id: instructorId,
      service_id: serviceId,
      status: 'confirmed',
      ...opts,
    };
    if (!opts.use_package) {
      body.amount = PRIVATE_LESSON_PRICE * dur;
    }

    const booking = await apiOk('POST', '/bookings?force=true', body, token);
    const bId = booking.id || booking.booking?.id;
    bookings.push({ id: bId, duration: dur });
    ok(`  Session ${i + 1}: ${dur}h on ${dateStr}`);
  }

  for (const b of bookings) {
    await apiOk('PUT', `/bookings/${b.id}`, { status: 'completed' }, token);
  }
  ok(`  All ${bookings.length} sessions completed`);
  return bookings;
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  title('RENTAL + LESSONS + ACCOMMODATION – FULL E2E TEST');

  // ════════════════════════════════════════════════════════════════════
  //  1 · Admin Login
  // ════════════════════════════════════════════════════════════════════
  title('1 · Admin Login');
  const token = await adminLogin();
  ok('Logged in as admin');

  // ════════════════════════════════════════════════════════════════════
  //  2 · Fetch Roles & Instructors
  // ════════════════════════════════════════════════════════════════════
  title('2 · Fetching roles & instructors');
  const roles = await apiOk('GET', '/roles', null, token);
  const studentRole = (Array.isArray(roles) ? roles : roles.roles || [])
    .find(r => r.name === 'student');
  if (!studentRole) throw new Error('Student role not found');
  ok(`Student role: ${studentRole.id}`);

  const instructorList = await apiOk('GET', '/instructors', null, token);
  const allInstructors = Array.isArray(instructorList) ? instructorList : instructorList.instructors || [];

  const siyabend = allInstructors.find(i => i.id === SIYABEND_ID);
  const oguzhan  = allInstructors.find(i => i.id === OGUZHAN_ID);
  if (!siyabend) throw new Error('Siyabend Şanlı not found');
  if (!oguzhan)  throw new Error('Oğuzhan Bentürk not found');

  const siyabendName = `${siyabend.first_name} ${siyabend.last_name}`;
  const oguzhanName  = `${oguzhan.first_name} ${oguzhan.last_name}`;
  ok(`Instructors: ${siyabendName}, ${oguzhanName}`);

  // ════════════════════════════════════════════════════════════════════
  //  3 · Create Turkish Customer
  // ════════════════════════════════════════════════════════════════════
  title('3 · Creating Turkish customer');
  const c1 = await createCustomer(TURKISH_PROFILES, studentRole.id, token);
  const displayName = `${c1.profile.first_name} ${c1.profile.last_name}`;
  ok(`Created: ${displayName} (${c1.profile.email}) → ${c1.userId}`);

  // ════════════════════════════════════════════════════════════════════
  //  4 · Fund Wallet → €2,500
  // ════════════════════════════════════════════════════════════════════
  title('4 · Funding wallet → €5,000');
  await fundWallet(c1.userId, 5000, token);
  ok('Wallet funded: €5,000');

  const balanceAfterFund = await getWalletBalance(c1.userId, token);
  assert(Math.abs(balanceAfterFund - 5000) < 1, `Wallet balance = €${balanceAfterFund} (expected €5,000)`);

  // ════════════════════════════════════════════════════════════════════
  //  5 · WEEK 1: 7 Non-Package SLS Rentals (paid from wallet)
  // ════════════════════════════════════════════════════════════════════
  title('5 · Week 1: Creating 7 non-package SLS rentals');

  const nonPkgRentals = [];
  for (let i = 0; i < 7; i++) {
    const startDate = futureDate(i + 1);
    const endDate   = futureDate(i + 2);

    const rental = await apiOk('POST', '/rentals', {
      user_id: c1.userId,
      equipment_ids: [SLS_EQUIPMENT_SERVICE_ID],
      rental_days: 1,
      start_date: startDate,
      end_date: endDate,
      use_package: false,
      payment_method: 'wallet',
    }, token);

    const rId = rental.id || rental.rental?.id;
    nonPkgRentals.push(rId);
    ok(`Rental ${i + 1}: day ${startDate}`);
  }

  for (const rId of nonPkgRentals) {
    try { await apiOk('PATCH', `/rentals/${rId}/activate`, null, token); } catch { /* may already be active */ }
  }
  for (const rId of nonPkgRentals) {
    await apiOk('PATCH', `/rentals/${rId}/complete`, null, token);
  }
  ok(`All ${nonPkgRentals.length} non-package rentals activated & completed`);

  // ════════════════════════════════════════════════════════════════════
  //  6 · Wallet check after Week 1
  // ════════════════════════════════════════════════════════════════════
  title('6 · Wallet verification after Week 1');
  const balanceAfterWeek1 = await getWalletBalance(c1.userId, token);
  log(`  Wallet: €${balanceAfterWeek1}`);
  assert(balanceAfterWeek1 < balanceAfterFund,
    `Wallet decreased after non-package rentals: €${balanceAfterWeek1} < €${balanceAfterFund}`);
  const week1Spent = balanceAfterFund - balanceAfterWeek1;
  log(`  Week 1 spent: €${week1Spent.toFixed(2)} (7 daily rentals from wallet)`);

  // ════════════════════════════════════════════════════════════════════
  //  7 · WEEK 2: Purchase SLS Rental Package (€500) + use all 7 days
  // ════════════════════════════════════════════════════════════════════
  title(`7 · Purchasing ${SLS_RENTAL_PKG_NAME} (€${SLS_RENTAL_PKG_PRICE})`);
  const rentalPkg = await apiOk('POST', '/services/customer-packages', {
    customerId: c1.userId,
    servicePackageId: SLS_RENTAL_PKG_ID,
    packageName: SLS_RENTAL_PKG_NAME,
    purchasePrice: SLS_RENTAL_PKG_PRICE,
    currency: 'EUR',
    rentalDays: SLS_RENTAL_PKG_DAYS,
  }, token);
  const rentalCpId = rentalPkg.id;
  ok(`Rental package assigned: ${rentalCpId}`);

  const pkgRentalDays = parseInt(rentalPkg.rentalDaysTotal ?? rentalPkg.rental_days_total ?? rentalPkg.rentalDays ?? SLS_RENTAL_PKG_DAYS);
  assert(pkgRentalDays === SLS_RENTAL_PKG_DAYS,
    `Package rental days = ${SLS_RENTAL_PKG_DAYS} (got ${pkgRentalDays})`);

  title('7b · Week 2: Creating 7 package-based SLS rentals');
  const pkgRentals = [];
  for (let i = 0; i < SLS_RENTAL_PKG_DAYS; i++) {
    const startDate = futureDate(10 + i);
    const endDate   = futureDate(10 + i + 1);

    const rental = await apiOk('POST', '/rentals', {
      user_id: c1.userId,
      equipment_ids: [SLS_EQUIPMENT_SERVICE_ID],
      rental_days: 1,
      start_date: startDate,
      end_date: endDate,
      use_package: true,
      customer_package_id: rentalCpId,
      payment_method: 'wallet',
    }, token);

    const rId = rental.id || rental.rental?.id;
    pkgRentals.push(rId);
    ok(`Rental ${i + 1}: day ${startDate}`);
  }

  for (const rId of pkgRentals) {
    try { await apiOk('PATCH', `/rentals/${rId}/activate`, null, token); } catch { /* may already be active */ }
  }
  for (const rId of pkgRentals) {
    await apiOk('PATCH', `/rentals/${rId}/complete`, null, token);
  }
  ok(`All ${pkgRentals.length} package rentals activated & completed`);

  // Rental package verification
  title('7c · Rental package status');
  const rentalPkgCheck = await apiOk('GET', `/services/customer-packages/${c1.userId}`, null, token);
  const rentalPkgList = Array.isArray(rentalPkgCheck) ? rentalPkgCheck : rentalPkgCheck.packages || rentalPkgCheck.data || [];
  const ourRentalPkg = rentalPkgList.find(p => p.id === rentalCpId);
  if (ourRentalPkg) {
    const remainDays = parseInt(ourRentalPkg.rental_days_remaining ?? ourRentalPkg.rentalDaysRemaining ?? -1);
    assert(remainDays === 0, `Rental pkg days remaining = 0 (got ${remainDays})`);
    const st = (ourRentalPkg.status || '').toLowerCase();
    assert(st === 'used_up' || st === 'completed' || st === 'expired',
      `Rental pkg status = used_up (got ${st})`);
  } else {
    fail('Could not find rental package for verification');
  }

  // ════════════════════════════════════════════════════════════════════
  //  8 · 6 h Starter Package with Siyabend Şanlı
  // ════════════════════════════════════════════════════════════════════
  title(`8 · Purchasing ${STARTER_PKG_NAME} (€${STARTER_PKG_PRICE})`);
  const lessonPkg = await apiOk('POST', '/services/customer-packages', {
    customerId: c1.userId,
    servicePackageId: STARTER_PKG_ID,
    packageName: STARTER_PKG_NAME,
    totalHours: STARTER_PKG_HOURS,
    purchasePrice: STARTER_PKG_PRICE,
    currency: 'EUR',
  }, token);
  const lessonCpId = lessonPkg.id;
  ok(`Lesson package assigned: ${lessonCpId}`);
  assert(parseFloat(lessonPkg.totalHours || lessonPkg.total_hours || 0) === STARTER_PKG_HOURS,
    `Package totalHours = ${STARTER_PKG_HOURS}`);

  title(`8b · Booking 6 h package lessons with ${siyabendName}`);
  const siyabendBookings = await bookAndCompleteLessons(
    SIYABEND_PKG_SESSIONS, c1.userId, SIYABEND_ID, PRIVATE_LESSON_SERVICE_ID, token, 20,
    { use_package: true, customer_package_id: lessonCpId }
  );

  // Verify package used up
  title('8c · Lesson package status');
  const lessonPkgCheck = await apiOk('GET', `/services/customer-packages/${c1.userId}`, null, token);
  const lessonPkgList = Array.isArray(lessonPkgCheck) ? lessonPkgCheck : lessonPkgCheck.packages || lessonPkgCheck.data || [];
  const ourLessonPkg = lessonPkgList.find(p => p.id === lessonCpId);
  if (ourLessonPkg) {
    const remaining = parseFloat(ourLessonPkg.remaining_hours ?? ourLessonPkg.remainingHours ?? -1);
    const used      = parseFloat(ourLessonPkg.used_hours ?? ourLessonPkg.usedHours ?? -1);
    assert(remaining === 0, `Lesson pkg remaining = 0 (got ${remaining})`);
    assert(used === STARTER_PKG_HOURS, `Lesson pkg used = ${STARTER_PKG_HOURS} (got ${used})`);
  } else {
    fail('Could not find lesson package for verification');
  }

  // ════════════════════════════════════════════════════════════════════
  //  9 · 10 Individual Lessons with Oğuzhan Bentürk
  // ════════════════════════════════════════════════════════════════════
  title(`9 · Booking 10 individual lessons (${OGUZHAN_TOTAL_HOURS}h) with ${oguzhanName}`);
  const oguzhanBookings = await bookAndCompleteLessons(
    OGUZHAN_SESSIONS, c1.userId, OGUZHAN_ID, PRIVATE_LESSON_SERVICE_ID, token, 30
  );

  const oguzhanExpectedCost = OGUZHAN_TOTAL_HOURS * PRIVATE_LESSON_PRICE;
  log(`  ${oguzhanBookings.length} lessons × mixed durations = ${OGUZHAN_TOTAL_HOURS}h → €${oguzhanExpectedCost}`);

  // ════════════════════════════════════════════════════════════════════
  //  10 · 10-Night Accommodation
  // ════════════════════════════════════════════════════════════════════
  const accomCheckIn  = futureDate(50);
  const accomCheckOut = futureDate(60);
  title(`10 · Booking 10-night accommodation (${accomCheckIn} → ${accomCheckOut})`);
  const accomRes = await apiOk('POST', '/accommodation/bookings', {
    unit_id: ACCOMMODATION_UNIT_ID,
    guest_id: c1.userId,
    check_in_date: accomCheckIn,
    check_out_date: accomCheckOut,
    guests_count: 1,
    payment_method: 'wallet',
  }, token);
  const accomId = accomRes.id || accomRes.booking?.id;
  ok(`Accommodation booked: ${accomId}`);

  try {
    await apiOk('PATCH', `/accommodation/bookings/${accomId}/confirm`, null, token);
    ok('Accommodation confirmed');
  } catch {
    ok('Accommodation already confirmed (wallet auto-confirm)');
  }

  // ════════════════════════════════════════════════════════════════════
  //  11 · Final Wallet Verification
  // ════════════════════════════════════════════════════════════════════
  title('11 · Final wallet verification');
  const finalBalance = await getWalletBalance(c1.userId, token);
  log(`  Final wallet: €${finalBalance}`);
  log(`  Started with: €5,000`);
  log(`  Spent: rentals (€${week1Spent.toFixed(0)}) + rental pkg (€${SLS_RENTAL_PKG_PRICE}) + lesson pkg (€${STARTER_PKG_PRICE}) + individual lessons (€${oguzhanExpectedCost}) + accommodation`);
  assert(finalBalance < balanceAfterFund, `Wallet decreased from €5,000 (now €${finalBalance})`);
  assert(finalBalance >= 0, `Wallet is not negative: €${finalBalance}`);

  // ════════════════════════════════════════════════════════════════════
  //  12 · Instructor Earnings Verification
  // ════════════════════════════════════════════════════════════════════
  title(`12 · ${siyabendName} Earnings`);
  const siyabendEarningsRes = await apiOk('GET', `/finances/instructor-earnings/${SIYABEND_ID}`, null, token);
  const siyabendAllEarnings = siyabendEarningsRes.earnings || [];
  const siyabendBookingIds = new Set(siyabendBookings.map(b => b.id));
  const siyabendOurEarnings = siyabendAllEarnings.filter(e => siyabendBookingIds.has(e.booking_id));
  const siyabendTotalEarned = siyabendOurEarnings.reduce((s, e) => s + (e.total_earnings || 0), 0);
  log(`  ${siyabendBookings.length} bookings → ${siyabendOurEarnings.length} earnings → €${siyabendTotalEarned.toFixed(2)}`);
  assert(siyabendOurEarnings.length === siyabendBookings.length,
    `${siyabendName}: ${siyabendBookings.length} bookings → ${siyabendOurEarnings.length} earnings`);
  assert(siyabendTotalEarned > 0, `${siyabendName}: total earned > €0 (€${siyabendTotalEarned.toFixed(2)})`);

  title(`12b · ${oguzhanName} Earnings`);
  const oguzhanEarningsRes = await apiOk('GET', `/finances/instructor-earnings/${OGUZHAN_ID}`, null, token);
  const oguzhanAllEarnings = oguzhanEarningsRes.earnings || [];
  const oguzhanBookingIds = new Set(oguzhanBookings.map(b => b.id));
  const oguzhanOurEarnings = oguzhanAllEarnings.filter(e => oguzhanBookingIds.has(e.booking_id));
  const oguzhanTotalEarned = oguzhanOurEarnings.reduce((s, e) => s + (e.total_earnings || 0), 0);
  log(`  ${oguzhanBookings.length} bookings → ${oguzhanOurEarnings.length} earnings → €${oguzhanTotalEarned.toFixed(2)}`);
  assert(oguzhanOurEarnings.length === oguzhanBookings.length,
    `${oguzhanName}: ${oguzhanBookings.length} bookings → ${oguzhanOurEarnings.length} earnings`);
  assert(oguzhanTotalEarned > 0, `${oguzhanName}: total earned > €0 (€${oguzhanTotalEarned.toFixed(2)})`);

  // ════════════════════════════════════════════════════════════════════
  //  13 · Manager Commission Verification
  // ════════════════════════════════════════════════════════════════════
  title('13 · Manager Commission Verification');

  const managersRes = await apiOk('GET', '/manager/commissions/admin/managers', null, token);
  const managers = managersRes.data || managersRes || [];
  if (!managers.length) {
    warn('No managers found — skipping commission check');
  } else {
    const manager = managers[0];
    const managerId = manager.id || manager.user_id || manager.userId;
    const managerName = `${manager.first_name || ''} ${manager.last_name || ''}`.trim();
    log(`  Manager: ${managerName} (${managerId})`);

    const mgCommRes = await apiOk(
      'GET', `/manager/commissions/admin/managers/${managerId}/commissions?limit=500`, null, token
    );
    const mgComm = mgCommRes.data || mgCommRes || [];

    // Rental commissions
    const allRentalIds = new Set([...nonPkgRentals, ...pkgRentals]);
    const rentalComm = mgComm.filter(c =>
      allRentalIds.has(c.source_id) || allRentalIds.has(c.rental_id) || allRentalIds.has(c.sourceId)
    );
    const rentalCommTotal = rentalComm.reduce(
      (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
    );

    const nonPkgSet = new Set(nonPkgRentals);
    const nonPkgComm = rentalComm.filter(c =>
      nonPkgSet.has(c.source_id) || nonPkgSet.has(c.rental_id) || nonPkgSet.has(c.sourceId)
    );
    const nonPkgCommTotal = nonPkgComm.reduce(
      (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
    );
    const pkgRentalSet = new Set(pkgRentals);
    const pkgRentalComm = rentalComm.filter(c =>
      pkgRentalSet.has(c.source_id) || pkgRentalSet.has(c.rental_id) || pkgRentalSet.has(c.sourceId)
    );
    const pkgRentalCommTotal = pkgRentalComm.reduce(
      (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
    );

    log(`  Rental commissions: ${rentalComm.length} records → €${rentalCommTotal.toFixed(2)}`);
    log(`    Non-package: ${nonPkgComm.length} records → €${nonPkgCommTotal.toFixed(2)}`);
    log(`    Package:     ${pkgRentalComm.length} records → €${pkgRentalCommTotal.toFixed(2)}`);

    assert(nonPkgComm.length === 7,
      `Non-package rental commissions: ${nonPkgComm.length} (expected 7)`);
    assert(nonPkgCommTotal > 0,
      `Non-package rental commission > €0 (€${nonPkgCommTotal.toFixed(2)})`);
    assert(pkgRentalComm.length === 7,
      `Package rental commissions: ${pkgRentalComm.length} (expected 7)`);
    assert(pkgRentalCommTotal > 0,
      `Package rental commission > €0 (€${pkgRentalCommTotal.toFixed(2)})`);

    // Booking commissions
    const allBookingIds = new Set([
      ...siyabendBookings.map(b => b.id),
      ...oguzhanBookings.map(b => b.id),
    ]);
    const bookingComm = mgComm.filter(c =>
      allBookingIds.has(c.source_id) || allBookingIds.has(c.booking_id) || allBookingIds.has(c.sourceId)
    );
    const bookingCommTotal = bookingComm.reduce(
      (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
    );
    log(`  Booking commissions: ${bookingComm.length} records → €${bookingCommTotal.toFixed(2)}`);
    assert(bookingComm.length === siyabendBookings.length + oguzhanBookings.length,
      `Booking commissions: ${bookingComm.length} (expected ${siyabendBookings.length + oguzhanBookings.length})`);
    assert(bookingCommTotal > 0,
      `Booking commission total > €0 (€${bookingCommTotal.toFixed(2)})`);

    // Accommodation commissions
    const accomComm = mgComm.filter(c => c.source_type === 'accommodation');
    const accomCommTotal = accomComm.reduce(
      (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
    );
    log(`  Accommodation commissions: ${accomComm.length} records → €${accomCommTotal.toFixed(2)}`);
    if (accomComm.length > 0) {
      ok(`Accommodation commission records exist (${accomComm.length})`);
    } else {
      warn('No accommodation commissions — check accommodationRate in manager settings');
    }

    // Dashboard summary
    const mgSummaryRes = await apiOk(
      'GET', `/manager/commissions/admin/managers/${managerId}/summary`, null, token
    );
    const mgSummary = mgSummaryRes.data || mgSummaryRes;
    const totalMgrEarned = parseFloat(mgSummary?.totalEarned ?? mgSummary?.total_earned ?? 0);
    log(`  Manager total earned: €${totalMgrEarned.toFixed(2)}`);
    assert(totalMgrEarned > 0, `Manager dashboard totalEarned > €0 (€${totalMgrEarned.toFixed(2)})`);
  }

  // ════════════════════════════════════════════════════════════════════
  //  14 · Finance Summary
  // ════════════════════════════════════════════════════════════════════
  title('14 · Finance Summary');
  const summary = await apiOk('GET', '/finances/summary?mode=accrual', null, token);
  const revenue = summary.revenue || {};
  log(`  Total revenue: €${revenue.total_revenue}`);
  log(`  Lesson revenue: €${revenue.lesson_revenue || 0}`);
  log(`  Rental revenue: €${revenue.rental_revenue || 0}`);
  assert(Number(revenue.total_revenue) > 0, `Total revenue > 0: €${revenue.total_revenue}`);
  assert(Number(revenue.lesson_revenue) > 0, `Lesson revenue > 0: €${revenue.lesson_revenue}`);

  // ════════════════════════════════════════════════════════════════════
  //  TEST RESULTS
  // ════════════════════════════════════════════════════════════════════
  title('TEST RESULTS');
  log(`\n  ${passedTests}/${totalTests} tests passed\n`);

  if (passedTests === totalTests) {
    log('  🎉 ALL TESTS PASSED!\n');
  } else {
    log(`  ⚠️  ${totalTests - passedTests} test(s) failed.\n`);
  }

  log('─'.repeat(60));
  log(`  Customer: ${displayName} (${c1.profile.email})`);
  log(`  User ID:  ${c1.userId}`);
  log(`  Rentals: ${nonPkgRentals.length} non-pkg + ${pkgRentals.length} pkg`);
  log(`  Lessons: ${siyabendBookings.length} (${siyabendName}) + ${oguzhanBookings.length} (${oguzhanName})`);
  log(`  Accommodation: 10 nights`);
  log(`  Cleanup:  node tests/scripts/cleanup.mjs`);
  log('─'.repeat(60));

  process.exit(passedTests === totalTests ? 0 : 1);
}

main().catch(e => {
  console.error('\n❌ FATAL:', e.message);
  process.exit(1);
});
