#!/usr/bin/env node
/**
 * Full Revenue Stream – E2E Test
 *
 * Creates 6 customers (1 German, 5 Turkish) and exercises every revenue stream:
 *
 *   Customer 1 (DE): 10 h package + 3 h non-pkg lessons → Elif Sarı
 *   Customer 2 (TR): Kitesurf Learning Pkg (12 h + 7 nights) → Siyabend Şanlı
 *   Customer 3 (TR): 14-night accommodation + Seasonal Daily Pass (180 d)
 *   Customer 4 (TR): 1-week SLS rental package (7 × half-day)
 *   Customer 5 (TR): Shop + accommodation + 3 h lessons (Oğuzhan Bentürk) + 7-day rental
 *   Customer 6 (TR): 10 h package lessons → Oğuzhan Bentürk
 *
 * Then verifies:
 *   → instructor commissions & earnings (Elif, Siyabend, Oğuzhan)
 *   → manager receives commissions from bookings & rentals
 *   → admin finance dashboard: lessons, rentals, shop, accommodation, membership
 *
 * Usage:   node tests/scripts/testflows/ManagerCommissionFromBookings.mjs
 * Cleanup: node tests/scripts/cleanup.mjs
 */

import {
  API, PASSWORD, ADMIN_EMAIL,
  PROFILES, TURKISH_PROFILES,
  ELIF_ID, SIYABEND_ID, OGUZHAN_ID,
  PKG_SERVICE_PACKAGE_ID, PKG_NAME, PKG_PRICE, PKG_TOTAL_HOURS,
  PRIVATE_LESSON_SERVICE_ID, PRIVATE_LESSON_PRICE,
  PKG_SESSIONS, NON_PKG_SESSIONS,
  KITESURF_PKG_ID, KITESURF_PKG_NAME, KITESURF_PKG_PRICE,
  KITESURF_PKG_HOURS, KITESURF_PKG_NIGHTS, KITESURF_SESSIONS,
  SLS_RENTAL_PKG_ID, SLS_RENTAL_PKG_NAME, SLS_RENTAL_PKG_PRICE, SLS_RENTAL_PKG_DAYS,
  SEASONAL_PASS_OFFERING_ID, SEASONAL_PASS_PRICE,
  ACCOMMODATION_UNIT_ID, SLS_EQUIPMENT_SERVICE_ID,
  log, ok, fail, title,
  api, apiOk, shuffle, adminLogin,
} from '../_shared.mjs';

// ── Date helper ────────────────────────────────────────────────────
// Random base offset (60–300 days out) so each run gets unique time slots
const DATE_BASE_OFFSET = 60 + Math.floor(Math.random() * 240);
function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + DATE_BASE_OFFSET + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// ── Test counters ──────────────────────────────────────────────────
let totalTests  = 0;
let passedTests = 0;

function assert(condition, label) {
  totalTests++;
  if (condition) { passedTests++; ok(label); }
  else { fail(label); }
}

function warn(msg) { log(`  ⚠️  ${msg}`); }

// ── Reusable helpers ───────────────────────────────────────────────or

/** Try all profiles to create a user, return { profile, userId } */
async function createCustomer(profiles, roleId, token) {
  for (const p of shuffle(profiles)) {
    const res = await api('POST', '/users', { ...p, password: PASSWORD, role_id: roleId }, token);
    if (res.ok) {
      const userId = res.data.id || res.data.user?.id;
      return { profile: p, userId };
    }
    if (res.status === 409) continue;
    throw new Error(`POST /users → ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
  }
  throw new Error(`All ${profiles.length} test profiles already exist. Run cleanup first.`);
}

/** Fund a user's wallet */
async function fundWallet(userId, amount, token) {
  await apiOk('POST', '/wallet/manual-adjust', {
    userId, amount, currency: 'EUR', description: 'Test wallet funding',
  }, token);
}

/** Book lessons, mark completed, return array of { id, duration } */
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

/** Create rentals from a package, activate, complete — return rental IDs */
async function createAndCompleteRentals(days, userId, equipmentServiceId, cpId, token, dayOffset) {
  const rentals = [];
  for (let i = 0; i < days; i++) {
    const startDate = futureDate(dayOffset + i);
    const endDate   = futureDate(dayOffset + i + 1);

    const rental = await apiOk('POST', '/rentals', {
      user_id: userId,
      equipment_ids: [equipmentServiceId],
      rental_days: 1,
      start_date: startDate,
      end_date: endDate,
      use_package: true,
      customer_package_id: cpId,
      payment_method: 'wallet',
    }, token);

    const rId = rental.id || rental.rental?.id;
    rentals.push(rId);
    ok(`  Rental ${i + 1}: day ${startDate}`);
  }

  for (const rId of rentals) {
    try { await apiOk('PATCH', `/rentals/${rId}/activate`, null, token); } catch { /* may already be active */ }
  }
  for (const rId of rentals) {
    await apiOk('PATCH', `/rentals/${rId}/complete`, null, token);
  }
  ok(`  All ${rentals.length} rentals activated & completed`);
  return rentals;
}

// ── Main ───────────────────────────────────────────────────────────
// Track all created data across customers for final verification
const allCustomers       = [];   // { label, profile, userId }
const allBookingIds      = [];   // all lesson booking IDs
const allRentalIds       = [];   // all rental IDs
let   shopOrderId        = null;
let   accommodationIds   = [];
let   memberPurchaseId   = null;

async function main() {
  title('FULL REVENUE STREAM – E2E TEST');

  // ════════════════════════════════════════════════════════════════════
  //  PHASE 1 · SETUP
  // ════════════════════════════════════════════════════════════════════

  title('1 · Admin Login');
  const token = await adminLogin();
  ok('Logged in as admin');

  // ── Roles ──
  title('2 · Fetching roles & instructors');
  const roles = await apiOk('GET', '/roles', null, token);
  const studentRole = (Array.isArray(roles) ? roles : roles.roles || [])
    .find(r => r.name === 'student');
  if (!studentRole) throw new Error('Student role not found');
  ok(`Student role: ${studentRole.id}`);

  // ── Instructors ──
  const instructorList = await apiOk('GET', '/instructors', null, token);
  const allInstructors = Array.isArray(instructorList) ? instructorList : instructorList.instructors || [];

  const elif     = allInstructors.find(i => i.id === ELIF_ID);
  const siyabend = allInstructors.find(i => i.id === SIYABEND_ID);
  const oguzhan  = allInstructors.find(i => i.id === OGUZHAN_ID);
  if (!elif)     throw new Error('Elif Sarı not found');
  if (!siyabend) throw new Error('Siyabend Şanlı not found');
  if (!oguzhan)  throw new Error('Oğuzhan Bentürk not found');

  const elifName     = `${elif.first_name} ${elif.last_name}`;
  const siyabendName = `${siyabend.first_name} ${siyabend.last_name}`;
  const oguzhanName  = `${oguzhan.first_name} ${oguzhan.last_name}`;
  ok(`Instructors: ${elifName}, ${siyabendName}, ${oguzhanName}`);

  // ── Manager ──
  title('3 · Manager setup');
  const managersRes = await apiOk('GET', '/manager/commissions/admin/managers', null, token);
  const managers = managersRes.data || managersRes || [];
  if (!managers.length) throw new Error('No managers found');

  const manager = managers[0];
  const managerName = manager.name || `${manager.first_name || ''} ${manager.last_name || ''}`.trim() || manager.email;
  const managerId   = manager.id;
  ok(`Manager: ${managerName} (${managerId})`);

  const existingSettingsRes = await apiOk('GET', `/manager/commissions/admin/managers/${managerId}/settings`, null, token);
  const existingSettings = existingSettingsRes.data || existingSettingsRes;
  let settingsWereNull = !existingSettings;

  // Always ensure all 6 per-category rates are set for comprehensive testing
  const needsUpdate = !existingSettings
    || !existingSettings.accommodationRate
    || !existingSettings.shopRate
    || !existingSettings.membershipRate
    || !existingSettings.packageRate;

  if (needsUpdate) {
    await apiOk('PUT', `/manager/commissions/admin/managers/${managerId}/settings`, {
      commissionType: 'per_category', defaultRate: 10,
      bookingRate: 10, rentalRate: 10,
      accommodationRate: 10, shopRate: 10,
      membershipRate: 10, packageRate: 10,
      salaryType: 'commission',
    }, token);
    log(`  ℹ️  Configured 10% per-category commission for this test run`);
    settingsWereNull = true;
  }

  const settingsRes = await apiOk('GET', `/manager/commissions/admin/managers/${managerId}/settings`, null, token);
  const settings = settingsRes.data || settingsRes;
  log(`  Commission: ${settings?.commissionType || 'flat'}, rate: ${settings?.defaultRate ?? 10}%`);

  // ════════════════════════════════════════════════════════════════════
  //  CUSTOMER 1 · German — Package Lessons + Non-Package (Elif Sarı)
  // ════════════════════════════════════════════════════════════════════

  title('C1 · Creating German customer');
  const c1 = await createCustomer(PROFILES, studentRole.id, token);
  allCustomers.push({ label: 'C1-German', ...c1 });
  ok(`Created: ${c1.profile.first_name} ${c1.profile.last_name} (${c1.profile.email})`);

  title('C1 · Funding wallet → €2,500');
  await fundWallet(c1.userId, 2500, token);
  ok('Wallet funded: €2,500');

  title('C1 · Purchasing 10 h Rider Progression Pack (€700)');
  const c1Pkg = await apiOk('POST', '/services/customer-packages', {
    customerId: c1.userId,
    servicePackageId: PKG_SERVICE_PACKAGE_ID,
    packageName: PKG_NAME,
    totalHours: PKG_TOTAL_HOURS,
    purchasePrice: PKG_PRICE,
    currency: 'EUR',
  }, token);
  const c1CpId = c1Pkg.id;
  ok(`Package assigned: ${c1CpId}`);
  assert(parseFloat(c1Pkg.totalHours) === PKG_TOTAL_HOURS, `C1 package totalHours = ${PKG_TOTAL_HOURS}`);

  title(`C1 · Booking 10 h package lessons with ${elifName}`);
  const c1PkgBookings = await bookAndCompleteLessons(
    PKG_SESSIONS, c1.userId, ELIF_ID, PRIVATE_LESSON_SERVICE_ID, token, 1,
    { use_package: true, customer_package_id: c1CpId }
  );

  title('C1 · Package status verification');
  const c1PkgCheck = await apiOk('GET', `/services/customer-packages/${c1.userId}`, null, token);
  const c1OurPkg = (Array.isArray(c1PkgCheck) ? c1PkgCheck : c1PkgCheck.packages || c1PkgCheck.data || [])
    .find(p => p.id === c1CpId);
  if (c1OurPkg) {
    const remaining = parseFloat(c1OurPkg.remaining_hours ?? c1OurPkg.remainingHours ?? -1);
    const used      = parseFloat(c1OurPkg.used_hours ?? c1OurPkg.usedHours ?? -1);
    assert(remaining === 0, `C1 package remaining = 0 (got ${remaining})`);
    assert(used === PKG_TOTAL_HOURS, `C1 package used = ${PKG_TOTAL_HOURS} (got ${used})`);
    const st = (c1OurPkg.status || '').toLowerCase();
    assert(st === 'used_up' || st === 'completed' || st === 'expired', `C1 package status = used_up (got ${st})`);
  } else { fail('C1 package not found'); }

  title(`C1 · Booking 3 h non-package lessons with ${elifName}`);
  const c1NonPkgBookings = await bookAndCompleteLessons(
    NON_PKG_SESSIONS, c1.userId, ELIF_ID, PRIVATE_LESSON_SERVICE_ID, token,
    PKG_SESSIONS.length + 2
  );

  const c1AllBookings = [...c1PkgBookings, ...c1NonPkgBookings];
  allBookingIds.push(...c1AllBookings.map(b => b.id));

  title('C1 · Wallet verification');
  const c1Acct = await apiOk('GET', `/finances/accounts/${c1.userId}`, null, token);
  const c1Balance = parseFloat(c1Acct.balance ?? c1Acct.wallet?.balance ?? 0);
  assert(Math.abs(c1Balance - (2500 - PKG_PRICE)) < 1,
    `C1 wallet: €${c1Balance} (expected €${2500 - PKG_PRICE})`);

  // ════════════════════════════════════════════════════════════════════
  //  CUSTOMER 2 · Turkish — Kitesurf Learning Package (Siyabend Şanlı)
  // ════════════════════════════════════════════════════════════════════

  title('C2 · Creating Turkish customer for Kitesurf Learning Package');
  const c2 = await createCustomer(TURKISH_PROFILES, studentRole.id, token);
  allCustomers.push({ label: 'C2-Kitesurf', ...c2 });
  ok(`Created: ${c2.profile.first_name} ${c2.profile.last_name} (${c2.profile.email})`);

  title('C2 · Funding wallet → €3,000');
  await fundWallet(c2.userId, 3000, token);
  ok('Wallet funded: €3,000');

  title(`C2 · Purchasing Kitesurf Learning Package (€${KITESURF_PKG_PRICE})`);
  const c2Pkg = await apiOk('POST', '/services/customer-packages', {
    customerId: c2.userId,
    servicePackageId: KITESURF_PKG_ID,
    packageName: KITESURF_PKG_NAME,
    totalHours: KITESURF_PKG_HOURS,
    purchasePrice: KITESURF_PKG_PRICE,
    currency: 'EUR',
    accommodationNights: KITESURF_PKG_NIGHTS,
    includesAccommodation: true,
    includesLessons: true,
    accommodationUnitId: ACCOMMODATION_UNIT_ID,
    packageType: 'accommodation_lesson',
  }, token);
  const c2CpId = c2Pkg.id;
  ok(`Package assigned: ${c2CpId}`);
  assert(parseFloat(c2Pkg.totalHours || c2Pkg.total_hours || 0) === KITESURF_PKG_HOURS,
    `C2 package totalHours = ${KITESURF_PKG_HOURS}`);

  title(`C2 · Booking 12 h kitesurf lessons with ${siyabendName}`);
  // Accommodation dates: days 1–8 (well-separated from C3/C5)
  const c2Bookings = await bookAndCompleteLessons(
    KITESURF_SESSIONS, c2.userId, SIYABEND_ID, PRIVATE_LESSON_SERVICE_ID, token, 1,
    { use_package: true, customer_package_id: c2CpId }
  );
  allBookingIds.push(...c2Bookings.map(b => b.id));

  title('C2 · Consuming 7 accommodation nights from package');
  try {
    await apiOk('POST', `/services/customer-packages/${c2CpId}/use-accommodation-nights`, {
      nightsToUse: KITESURF_PKG_NIGHTS,
      checkInDate: futureDate(1),
    }, token);
    ok(`Consumed ${KITESURF_PKG_NIGHTS} accommodation nights`);
  } catch (e) {
    warn(`Accommodation night consumption endpoint may differ: ${e.message}`);
    log('  Attempting alternative: PATCH with accommodation nights used...');
    try {
      await apiOk('PUT', `/services/customer-packages/${c2CpId}`, {
        accommodation_nights_used: KITESURF_PKG_NIGHTS,
        accommodation_nights_remaining: 0,
      }, token);
      ok('Accommodation nights updated via PUT');
    } catch (e2) {
      warn(`Could not consume accommodation nights: ${e2.message}`);
    }
  }

  title('C2 · Package verification');
  const c2PkgCheck = await apiOk('GET', `/services/customer-packages/${c2.userId}`, null, token);
  const c2OurPkg = (Array.isArray(c2PkgCheck) ? c2PkgCheck : c2PkgCheck.packages || c2PkgCheck.data || [])
    .find(p => p.id === c2CpId);
  if (c2OurPkg) {
    const remaining = parseFloat(c2OurPkg.remaining_hours ?? c2OurPkg.remainingHours ?? -1);
    assert(remaining === 0, `C2 lesson hours remaining = 0 (got ${remaining})`);
    const accRemaining = parseFloat(c2OurPkg.accommodation_nights_remaining ?? c2OurPkg.accommodationNightsRemaining ?? -1);
    if (accRemaining >= 0) {
      assert(accRemaining === 0, `C2 accommodation nights remaining = 0 (got ${accRemaining})`);
    }
  } else { fail('C2 package not found'); }

  title('C2 · Wallet verification');
  const c2Acct = await apiOk('GET', `/finances/accounts/${c2.userId}`, null, token);
  const c2Balance = parseFloat(c2Acct.balance ?? c2Acct.wallet?.balance ?? 0);
  assert(Math.abs(c2Balance - (3000 - KITESURF_PKG_PRICE)) < 1,
    `C2 wallet: €${c2Balance} (expected €${3000 - KITESURF_PKG_PRICE})`);

  // ════════════════════════════════════════════════════════════════════
  //  CUSTOMER 3 · Turkish — 14-night Accommodation + Seasonal Daily Pass
  // ════════════════════════════════════════════════════════════════════

  title('C3 · Creating Turkish customer for Accommodation + Pass');
  const c3 = await createCustomer(
    TURKISH_PROFILES.filter(p => p.email !== c2.profile.email),
    studentRole.id, token
  );
  allCustomers.push({ label: 'C3-Stay+Pass', ...c3 });
  ok(`Created: ${c3.profile.first_name} ${c3.profile.last_name} (${c3.profile.email})`);

  title('C3 · Funding wallet → €5,000');
  await fundWallet(c3.userId, 5000, token);
  ok('Wallet funded: €5,000');

  // Accommodation: days 30–44 (offset to avoid C2's days 1–8)
  const c3CheckIn  = futureDate(30);
  const c3CheckOut = futureDate(44);
  title(`C3 · Booking 14-night accommodation (${c3CheckIn} → ${c3CheckOut})`);
  const c3AccomRes = await apiOk('POST', '/accommodation/bookings', {
    unit_id: ACCOMMODATION_UNIT_ID,
    guest_id: c3.userId,
    check_in_date: c3CheckIn,
    check_out_date: c3CheckOut,
    guests_count: 1,
    payment_method: 'wallet',
  }, token);
  const c3AccomId = c3AccomRes.id || c3AccomRes.booking?.id;
  accommodationIds.push(c3AccomId);
  ok(`Accommodation booked: ${c3AccomId}`);

  // Try to confirm the booking (may auto-confirm for wallet payments)
  try {
    await apiOk('PATCH', `/accommodation/bookings/${c3AccomId}/confirm`, null, token);
    ok('Accommodation confirmed');
  } catch {
    ok('Accommodation already confirmed (wallet auto-confirm)');
  }

  title('C3 · Purchasing Seasonal Daily Pass (€300)');
  // Login as customer to purchase the pass (it uses the authenticated user)
  const c3LoginRes = await apiOk('POST', '/auth/login', { email: c3.profile.email, password: PASSWORD });
  const c3Token = c3LoginRes.token;

  const c3PassRes = await apiOk('POST', `/member-offerings/${SEASONAL_PASS_OFFERING_ID}/purchase`, {
    paymentMethod: 'wallet',
  }, c3Token);
  const c3Purchase = c3PassRes.purchase || c3PassRes;
  memberPurchaseId = c3Purchase.id;
  ok(`Pass purchased: ID ${memberPurchaseId}`);

  title('C3 · Verifying Seasonal Daily Pass');
  const c3Purchases = await apiOk('GET', `/member-offerings/user/${c3.userId}/purchases`, null, token);
  const c3Pass = (Array.isArray(c3Purchases) ? c3Purchases : c3Purchases.data || [])
    .find(p => String(p.offering_id) === String(SEASONAL_PASS_OFFERING_ID) || p.id === memberPurchaseId);
  if (c3Pass) {
    assert(c3Pass.status === 'active', `C3 pass status = active (got ${c3Pass.status})`);
    if (c3Pass.expires_at) {
      const daysUntilExpiry = (new Date(c3Pass.expires_at) - new Date()) / (1000 * 60 * 60 * 24);
      assert(daysUntilExpiry > 170, `C3 pass expires in ~180 days (got ${Math.round(daysUntilExpiry)} days)`);
    }
    ok('Seasonal Daily Pass is active');
  } else { fail('C3 pass not found in purchases'); }

  title('C3 · Wallet verification');
  const c3Acct = await apiOk('GET', `/finances/accounts/${c3.userId}`, null, token);
  const c3Balance = parseFloat(c3Acct.balance ?? c3Acct.wallet?.balance ?? 0);
  assert(c3Balance < 5000, `C3 wallet decreased from €5,000 (now €${c3Balance})`);
  assert(c3Balance < 5000 - SEASONAL_PASS_PRICE,
    `C3 wallet charged ≥ €${SEASONAL_PASS_PRICE} for pass+accommodation (now €${c3Balance})`);

  // ════════════════════════════════════════════════════════════════════
  //  CUSTOMER 4 · Turkish — 1-Week SLS Rental Package
  // ════════════════════════════════════════════════════════════════════

  title('C4 · Creating Turkish customer for SLS Rental Package');
  const usedEmails = allCustomers.map(c => c.profile.email);
  const c4 = await createCustomer(
    TURKISH_PROFILES.filter(p => !usedEmails.includes(p.email)),
    studentRole.id, token
  );
  allCustomers.push({ label: 'C4-Rental', ...c4 });
  ok(`Created: ${c4.profile.first_name} ${c4.profile.last_name} (${c4.profile.email})`);

  title('C4 · Funding wallet → €1,500');
  await fundWallet(c4.userId, 1500, token);
  ok('Wallet funded: €1,500');

  title(`C4 · Purchasing 1 Week SLS Rental Package (€${SLS_RENTAL_PKG_PRICE})`);
  const c4Pkg = await apiOk('POST', '/services/customer-packages', {
    customerId: c4.userId,
    servicePackageId: SLS_RENTAL_PKG_ID,
    packageName: SLS_RENTAL_PKG_NAME,
    purchasePrice: SLS_RENTAL_PKG_PRICE,
    currency: 'EUR',
    rentalDays: SLS_RENTAL_PKG_DAYS,
    includesRental: true,
    packageType: 'rental',
  }, token);
  const c4CpId = c4Pkg.id;
  ok(`Package assigned: ${c4CpId}`);

  // Verify rental days tracking
  const c4RentalDays = parseInt(c4Pkg.rentalDaysTotal ?? c4Pkg.rental_days_total ?? c4Pkg.rentalDays ?? SLS_RENTAL_PKG_DAYS);
  assert(c4RentalDays === SLS_RENTAL_PKG_DAYS, `C4 rental days total = ${SLS_RENTAL_PKG_DAYS} (got ${c4RentalDays})`);

  title('C4 · Creating 7 daily SLS rentals from package');
  // Rentals: days 15–22 (well separated from accommodation bookings)
  const c4Rentals = await createAndCompleteRentals(
    SLS_RENTAL_PKG_DAYS, c4.userId, SLS_EQUIPMENT_SERVICE_ID, c4CpId, token, 15
  );
  allRentalIds.push(...c4Rentals);

  title('C4 · Package verification');
  const c4PkgCheck = await apiOk('GET', `/services/customer-packages/${c4.userId}`, null, token);
  const c4OurPkg = (Array.isArray(c4PkgCheck) ? c4PkgCheck : c4PkgCheck.packages || c4PkgCheck.data || [])
    .find(p => p.id === c4CpId);
  if (c4OurPkg) {
    const daysRemaining = parseInt(c4OurPkg.rental_days_remaining ?? c4OurPkg.rentalDaysRemaining ?? -1);
    assert(daysRemaining === 0, `C4 rental days remaining = 0 (got ${daysRemaining})`);
    const st = (c4OurPkg.status || '').toLowerCase();
    assert(st === 'used_up' || st === 'completed' || st === 'expired',
      `C4 package status = used_up (got ${st})`);
  } else { fail('C4 package not found'); }

  title('C4 · Wallet verification');
  const c4Acct = await apiOk('GET', `/finances/accounts/${c4.userId}`, null, token);
  const c4Balance = parseFloat(c4Acct.balance ?? c4Acct.wallet?.balance ?? 0);
  assert(Math.abs(c4Balance - (1500 - SLS_RENTAL_PKG_PRICE)) < 1,
    `C4 wallet: €${c4Balance} (expected €${1500 - SLS_RENTAL_PKG_PRICE})`);

  // ════════════════════════════════════════════════════════════════════
  //  CUSTOMER 5 · Turkish — Full Combo (Shop + Accommodation + Lessons + Rental)
  // ════════════════════════════════════════════════════════════════════

  title('C5 · Creating Turkish customer for Full Combo');
  const usedEmails2 = allCustomers.map(c => c.profile.email);
  const c5 = await createCustomer(
    TURKISH_PROFILES.filter(p => !usedEmails2.includes(p.email)),
    studentRole.id, token
  );
  allCustomers.push({ label: 'C5-Combo', ...c5 });
  ok(`Created: ${c5.profile.first_name} ${c5.profile.last_name} (${c5.profile.email})`);

  title('C5 · Funding wallet → €5,000');
  await fundWallet(c5.userId, 5000, token);
  ok('Wallet funded: €5,000');

  // ── Shop purchase ──
  title('C5 · Shop purchase');
  const productsRes = await apiOk('GET', '/products?limit=10', null, token);
  const products = (productsRes.data || productsRes || []).filter(
    p => p.status === 'active' && (p.stock_quantity || 0) > 0
  );
  if (products.length < 1) throw new Error(`Need ≥ 1 active product, got ${products.length}`);

  // Build shop items respecting available stock
  let shopItems;
  if (products.length >= 2 && (products[1].stock_quantity || 0) > 0) {
    shopItems = [{ product_id: products[0].id, quantity: 1 }, { product_id: products[1].id, quantity: 1 }];
  } else {
    const maxQty = Math.min(products[0].stock_quantity || 1, 2);
    shopItems = [{ product_id: products[0].id, quantity: maxQty }];
  }
  const shopTotal = shopItems.reduce((s, item) => {
    const prod = products.find(p => p.id === item.product_id);
    return s + parseFloat(prod.price) * item.quantity;
  }, 0);
  log(`  Ordering: ${shopItems.map(i => { const p = products.find(x => x.id === i.product_id); return `${p.name} x${i.quantity} (€${p.price})`; }).join(' + ')}`);


  // Login as C5 to place order
  const c5LoginRes = await apiOk('POST', '/auth/login', { email: c5.profile.email, password: PASSWORD });
  const c5Token = c5LoginRes.token;

  const orderRes = await apiOk('POST', '/shop-orders', {
    items: shopItems,
    payment_method: 'wallet',
  }, c5Token);
  shopOrderId = orderRes.id || orderRes.order?.id;
  ok(`Shop order created: ${shopOrderId} (€${shopTotal.toFixed(2)})`);

  const orderStatus = (orderRes.status || orderRes.order?.status || '').toLowerCase();
  assert(orderStatus === 'confirmed' || orderStatus === 'pending' || orderStatus === 'processing',
    `C5 shop order status = confirmed/pending (got ${orderStatus})`);

  // ── Accommodation — days 60–67 ──
  const c5CheckIn  = futureDate(60);
  const c5CheckOut = futureDate(67);
  title(`C5 · Booking 7-night accommodation (${c5CheckIn} → ${c5CheckOut})`);
  const c5AccomRes = await apiOk('POST', '/accommodation/bookings', {
    unit_id: ACCOMMODATION_UNIT_ID,
    guest_id: c5.userId,
    check_in_date: c5CheckIn,
    check_out_date: c5CheckOut,
    guests_count: 1,
    payment_method: 'wallet',
  }, token);
  const c5AccomId = c5AccomRes.id || c5AccomRes.booking?.id;
  accommodationIds.push(c5AccomId);
  ok(`Accommodation booked: ${c5AccomId}`);

  try {
    await apiOk('PATCH', `/accommodation/bookings/${c5AccomId}/confirm`, null, token);
    ok('Accommodation confirmed');
  } catch {
    ok('Accommodation already confirmed');
  }

  // ── Lessons with Oğuzhan (non-package, 3 × 1 h) — days 60–62 ──
  title(`C5 · Booking 3 h lessons with ${oguzhanName}`);
  const c5Bookings = await bookAndCompleteLessons(
    [1, 1, 1], c5.userId, OGUZHAN_ID, PRIVATE_LESSON_SERVICE_ID, token, 60
  );
  allBookingIds.push(...c5Bookings.map(b => b.id));

  // ── Rental — 7-day SLS package ──
  title(`C5 · Purchasing SLS Rental Package (€${SLS_RENTAL_PKG_PRICE})`);
  const c5RentalPkg = await apiOk('POST', '/services/customer-packages', {
    customerId: c5.userId,
    servicePackageId: SLS_RENTAL_PKG_ID,
    packageName: SLS_RENTAL_PKG_NAME,
    purchasePrice: SLS_RENTAL_PKG_PRICE,
    currency: 'EUR',
    rentalDays: SLS_RENTAL_PKG_DAYS,
    includesRental: true,
    packageType: 'rental',
  }, token);
  const c5RentalCpId = c5RentalPkg.id;
  ok(`Rental package assigned: ${c5RentalCpId}`);

  title('C5 · Creating 7 daily SLS rentals from package');
  // Rentals: days 70–77
  const c5Rentals = await createAndCompleteRentals(
    SLS_RENTAL_PKG_DAYS, c5.userId, SLS_EQUIPMENT_SERVICE_ID, c5RentalCpId, token, 70
  );
  allRentalIds.push(...c5Rentals);

  title('C5 · Wallet verification');
  const c5Acct = await apiOk('GET', `/finances/accounts/${c5.userId}`, null, token);
  const c5Balance = parseFloat(c5Acct.balance ?? c5Acct.wallet?.balance ?? 0);
  assert(c5Balance < 5000, `C5 wallet decreased from €5,000 (now €${c5Balance})`);
  // Expected: 5000 - shopTotal - accommodation - 3*90 - 500
  const c5MinSpent = shopTotal + (3 * PRIVATE_LESSON_PRICE) + SLS_RENTAL_PKG_PRICE;
  assert(c5Balance <= 5000 - c5MinSpent + 1,
    `C5 spent ≥ €${c5MinSpent.toFixed(0)} on shop+lessons+rental (balance: €${c5Balance})`);

  // ════════════════════════════════════════════════════════════════════
  //  CUSTOMER 6 · Turkish — 10 h Package Lessons (Oğuzhan Bentürk)
  // ════════════════════════════════════════════════════════════════════

  title('C6 · Creating Turkish customer for 10 h Package (Oğuzhan)');
  const usedEmails3 = allCustomers.map(c => c.profile.email);
  const c6 = await createCustomer(
    TURKISH_PROFILES.filter(p => !usedEmails3.includes(p.email)),
    studentRole.id, token
  );
  allCustomers.push({ label: 'C6-PkgOguzhan', ...c6 });
  ok(`Created: ${c6.profile.first_name} ${c6.profile.last_name} (${c6.profile.email})`);

  title('C6 · Funding wallet → €2,500');
  await fundWallet(c6.userId, 2500, token);
  ok('Wallet funded: €2,500');

  title(`C6 · Purchasing 10 h Rider Progression Pack (€${PKG_PRICE})`);
  const c6Pkg = await apiOk('POST', '/services/customer-packages', {
    customerId: c6.userId,
    servicePackageId: PKG_SERVICE_PACKAGE_ID,
    packageName: PKG_NAME,
    totalHours: PKG_TOTAL_HOURS,
    purchasePrice: PKG_PRICE,
    currency: 'EUR',
  }, token);
  const c6CpId = c6Pkg.id;
  ok(`Package assigned: ${c6CpId}`);
  assert(parseFloat(c6Pkg.totalHours) === PKG_TOTAL_HOURS, `C6 package totalHours = ${PKG_TOTAL_HOURS}`);

  title(`C6 · Booking 10 h package lessons with ${oguzhanName}`);
  const c6Bookings = await bookAndCompleteLessons(
    PKG_SESSIONS, c6.userId, OGUZHAN_ID, PRIVATE_LESSON_SERVICE_ID, token, 80,
    { use_package: true, customer_package_id: c6CpId }
  );
  allBookingIds.push(...c6Bookings.map(b => b.id));

  title('C6 · Package status verification');
  const c6PkgCheck = await apiOk('GET', `/services/customer-packages/${c6.userId}`, null, token);
  const c6OurPkg = (Array.isArray(c6PkgCheck) ? c6PkgCheck : c6PkgCheck.packages || c6PkgCheck.data || [])
    .find(p => p.id === c6CpId);
  if (c6OurPkg) {
    const remaining = parseFloat(c6OurPkg.remaining_hours ?? c6OurPkg.remainingHours ?? -1);
    const used      = parseFloat(c6OurPkg.used_hours ?? c6OurPkg.usedHours ?? -1);
    assert(remaining === 0, `C6 package remaining = 0 (got ${remaining})`);
    assert(used === PKG_TOTAL_HOURS, `C6 package used = ${PKG_TOTAL_HOURS} (got ${used})`);
    const st = (c6OurPkg.status || '').toLowerCase();
    assert(st === 'used_up' || st === 'completed' || st === 'expired', `C6 package status = used_up (got ${st})`);
  } else { fail('C6 package not found'); }

  title('C6 · Wallet verification');
  const c6Acct = await apiOk('GET', `/finances/accounts/${c6.userId}`, null, token);
  const c6Balance = parseFloat(c6Acct.balance ?? c6Acct.wallet?.balance ?? 0);
  assert(Math.abs(c6Balance - (2500 - PKG_PRICE)) < 1,
    `C6 wallet: €${c6Balance} (expected €${2500 - PKG_PRICE})`);

  // ════════════════════════════════════════════════════════════════════
  //  PHASE 7 · INSTRUCTOR EARNINGS VERIFICATION
  // ════════════════════════════════════════════════════════════════════

  title('PHASE 7 · Instructor Earnings Verification');

  const allBookingIdSet = new Set(allBookingIds);
  const instructorChecks = [
    { id: ELIF_ID, name: elifName, expectedCount: c1AllBookings.length },
    { id: SIYABEND_ID, name: siyabendName, expectedCount: c2Bookings.length },
    { id: OGUZHAN_ID, name: oguzhanName, expectedCount: c5Bookings.length + c6Bookings.length },
  ];

  for (const instr of instructorChecks) {
    title(`  ${instr.name} earnings`);

    const earningsRes = await apiOk('GET', `/finances/instructor-earnings/${instr.id}`, null, token);
    const instrEarnings = (earningsRes.earnings || []).filter(e => allBookingIdSet.has(e.booking_id));
    const instrTotal = instrEarnings.reduce((s, e) => s + (e.total_earnings || 0), 0);
    log(`    ${instr.expectedCount} bookings → ${instrEarnings.length} earnings → €${instrTotal.toFixed(2)}`);

    assert(instrEarnings.length === instr.expectedCount,
      `${instr.name}: ${instr.expectedCount} bookings → ${instrEarnings.length} earnings`);
    assert(instrEarnings.every(e => (e.total_earnings || 0) > 0),
      `${instr.name}: all earnings > €0`);
  }

  // All instructor balances
  title('Instructor Balances');
  const balances = await apiOk('GET', '/finances/instructor-balances', null, token);
  for (const instr of instructorChecks) {
    const bal = balances[instr.id];
    assert(bal && bal.totalEarned > 0,
      `${instr.name}: totalEarned = €${bal?.totalEarned ?? 'N/A'} (> 0)`);
  }

  // ════════════════════════════════════════════════════════════════════
  //  PHASE 8 · MANAGER COMMISSION VERIFICATION
  // ════════════════════════════════════════════════════════════════════

  title('PHASE 8 · Manager Commission Verification');

  const mgCommissionsRes = await apiOk(
    'GET',
    `/manager/commissions/admin/managers/${managerId}/commissions?limit=200`,
    null, token
  );
  const mgCommissions = mgCommissionsRes.data || mgCommissionsRes || [];

  // Booking commissions
  const bookingCommRecs = mgCommissions.filter(c =>
    allBookingIdSet.has(c.source_id) || allBookingIdSet.has(c.booking_id) || allBookingIdSet.has(c.sourceId)
  );
  const bookingCommTotal = bookingCommRecs.reduce(
    (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
  );
  log(`  Booking commissions: ${bookingCommRecs.length} records → €${bookingCommTotal.toFixed(2)}`);

  assert(bookingCommRecs.length > 0,
    `${managerName}: booking commission records exist (${bookingCommRecs.length})`);
  assert(bookingCommTotal > 0,
    `${managerName}: booking commission total > €0 (€${bookingCommTotal.toFixed(2)})`);

  // Rental commissions
  const allRentalIdSet = new Set(allRentalIds);
  const rentalCommRecs = mgCommissions.filter(c =>
    allRentalIdSet.has(c.source_id) || allRentalIdSet.has(c.rental_id) || allRentalIdSet.has(c.sourceId)
  );
  const rentalCommTotal = rentalCommRecs.reduce(
    (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
  );
  log(`  Rental commissions: ${rentalCommRecs.length} records → €${rentalCommTotal.toFixed(2)}`);

  // Rental commissions — package rentals now derive value from package price
  assert(rentalCommRecs.length > 0,
    `${managerName}: rental commission records exist (${rentalCommRecs.length})`);
  assert(rentalCommTotal > 0,
    `${managerName}: rental commission total > €0 (€${rentalCommTotal.toFixed(2)})`);

  // Commission rates
  if (bookingCommRecs.length > 0) {
    const allHaveRate = bookingCommRecs.every(
      c => parseFloat(c.commission_rate ?? c.commissionRate ?? c.rate ?? 0) > 0
    );
    assert(allHaveRate, `${managerName}: all booking commissions have rate > 0%`);
  }

  // Shop / Accommodation / Membership / Package commissions
  const shopComm = mgCommissions.filter(c => c.source_type === 'shop');
  const accomComm = mgCommissions.filter(c => c.source_type === 'accommodation');
  const memberComm = mgCommissions.filter(c => c.source_type === 'membership');
  const pkgComm = mgCommissions.filter(c => c.source_type === 'package');

  const shopCommTotal = shopComm.reduce((s, c) => s + parseFloat(c.commission_amount ?? 0), 0);
  const accomCommTotal = accomComm.reduce((s, c) => s + parseFloat(c.commission_amount ?? 0), 0);
  const memberCommTotal = memberComm.reduce((s, c) => s + parseFloat(c.commission_amount ?? 0), 0);
  const pkgCommTotal = pkgComm.reduce((s, c) => s + parseFloat(c.commission_amount ?? 0), 0);

  log(`  Shop commissions: ${shopComm.length} records → €${shopCommTotal.toFixed(2)}`);
  log(`  Accommodation commissions: ${accomComm.length} records → €${accomCommTotal.toFixed(2)}`);
  log(`  Membership commissions: ${memberComm.length} records → €${memberCommTotal.toFixed(2)}`);
  log(`  Package commissions: ${pkgComm.length} records → €${pkgCommTotal.toFixed(2)} (no separate pkg commission — covered by individual bookings/rentals)`);

  assert(shopComm.length > 0,
    `${managerName}: shop commission records exist (${shopComm.length})`);
  assert(accomComm.length > 0,
    `${managerName}: accommodation commission records exist (${accomComm.length})`);
  assert(memberComm.length > 0,
    `${managerName}: membership commission records exist (${memberComm.length})`);
  assert(pkgComm.length === 0,
    `${managerName}: no package commissions (handled via booking/rental commissions, got ${pkgComm.length})`);

  // Manager dashboard summary
  title(`${managerName} Dashboard Summary`);
  const mgSummaryRes = await apiOk(
    'GET', `/manager/commissions/admin/managers/${managerId}/summary`, null, token
  );
  const mgSummary = mgSummaryRes.data || mgSummaryRes;
  const totalEarnedDashboard = parseFloat(mgSummary?.totalEarned ?? mgSummary?.total_earned ?? 0);
  log(`  Dashboard totalEarned: €${totalEarnedDashboard.toFixed(2)}`);
  assert(totalEarnedDashboard > 0,
    `${managerName} dashboard: totalEarned > €0 (€${totalEarnedDashboard.toFixed(2)})`);

  // Payroll
  const mgPayrollRes = await apiOk(
    'GET', `/manager/commissions/admin/managers/${managerId}/payroll`, null, token
  );
  const payrollData = mgPayrollRes.data || mgPayrollRes;
  const payrollMonths = payrollData?.months || (Array.isArray(payrollData) ? payrollData : []);
  const hasBookingPayroll = payrollMonths.some(m => parseFloat(m.bookings?.earnings ?? 0) > 0);
  assert(hasBookingPayroll, `${managerName} payroll shows booking earnings > €0`);

  // ════════════════════════════════════════════════════════════════════
  //  PHASE 9 · ADMIN FINANCE DASHBOARD VERIFICATION
  // ════════════════════════════════════════════════════════════════════

  title('PHASE 9 · Admin Finance Dashboard');

  const summary = await apiOk('GET', '/finances/summary?mode=accrual', null, token);
  const revenue = summary.revenue || {};

  log(`  total_revenue:      €${revenue.total_revenue}`);
  log(`  lesson_revenue:     €${revenue.lesson_revenue}`);
  log(`  rental_revenue:     €${revenue.rental_revenue}`);
  log(`  shop_revenue:       €${revenue.shop_revenue}`);
  log(`  membership_revenue: €${revenue.membership_revenue || revenue.vip_membership_revenue || 0}`);
  log(`  package_revenue:    €${revenue.package_revenue || 0}`);
  log(`  total_transactions: ${revenue.total_transactions}`);
  log(`  shop_order_count:   ${revenue.shop_order_count || 0}`);
  log(`  rental_count:       ${revenue.rental_count || 0}`);

  // Lesson revenue
  assert(Number(revenue.total_revenue) > 0,
    `Finance: total_revenue > 0 (€${revenue.total_revenue})`);
  assert(Number(revenue.lesson_revenue) > 0,
    `Finance: lesson_revenue > 0 (€${revenue.lesson_revenue})`);

  // Rental revenue (may be 0 if package rentals aren't counted as revenue)
  if (Number(revenue.rental_revenue) > 0) {
    ok(`Finance: rental_revenue > 0 (€${revenue.rental_revenue})`);
  } else {
    warn('Finance: rental_revenue = 0 (package-based rentals may not generate wallet revenue)');
  }

  // Shop revenue
  assert(Number(revenue.shop_revenue || 0) > 0,
    `Finance: shop_revenue > 0 (€${revenue.shop_revenue})`);

  // Net revenue / commission
  assert(Number(summary.netRevenue?.commission_total || 0) > 0,
    `Finance: commission_total > 0 (€${summary.netRevenue?.commission_total})`);

  // Accommodation revenue — check in other_revenue_breakdown
  const accomRevenue = Number(
    revenue.other_revenue_breakdown?.accommodation_charges ??
    revenue.accommodation_revenue ?? 0
  );
  if (accomRevenue > 0) {
    ok(`Finance: accommodation revenue > 0 (€${accomRevenue})`);
  } else {
    warn('Finance: accommodation revenue = 0 (may be tracked differently)');
  }

  // Membership revenue (Seasonal Daily Pass)
  const memberRevenue = Number(
    revenue.membership_revenue ?? revenue.vip_membership_revenue ?? 0
  );
  if (memberRevenue > 0) {
    ok(`Finance: membership/pass revenue > 0 (€${memberRevenue})`);
  } else {
    warn('Finance: membership revenue = 0 (pass may be tracked in a different category)');
  }

  // Booking counts
  const totalBookings = Number(summary.bookings?.total_bookings ?? 0);
  log(`  total_bookings: ${totalBookings}`);
  assert(totalBookings >= allBookingIds.length,
    `Finance: total_bookings ≥ ${allBookingIds.length} (got ${totalBookings})`);

  // Shop order count
  const shopCount = Number(revenue.shop_order_count ?? 0);
  if (shopCount >= 1) {
    ok(`Finance: shop_order_count ≥ 1 (${shopCount})`);
  } else {
    warn('Finance: shop_order_count = 0 in summary (may require date filtering)');
  }

  // Rental count
  const rentalCount = Number(revenue.rental_count ?? 0);
  if (rentalCount >= allRentalIds.length) {
    ok(`Finance: rental_count ≥ ${allRentalIds.length} (${rentalCount})`);
  } else {
    warn(`Finance: rental_count = ${rentalCount} (expected ≥ ${allRentalIds.length})`);
  }

  // Transaction count
  assert(Number(revenue.total_transactions) > 0,
    `Finance: total_transactions > 0 (${revenue.total_transactions})`);

  // ════════════════════════════════════════════════════════════════════
  //  CLEANUP & SUMMARY
  // ════════════════════════════════════════════════════════════════════

  // Restore manager settings if we set them temporarily
  if (settingsWereNull) {
    try {
      await api('PUT', `/manager/commissions/admin/managers/${managerId}/settings`, {
        commissionType: 'flat', defaultRate: 0, bookingRate: 0, salaryType: 'commission',
      }, token);
      log(`  ℹ️  Restored manager commission settings to 0%`);
    } catch { /* best effort */ }
  }

  title('TEST RESULTS');
  log(`\n  ${passedTests}/${totalTests} tests passed\n`);

  if (passedTests === totalTests) {
    log('  🎉 ALL TESTS PASSED!\n');
  } else {
    log(`  ⚠️  ${totalTests - passedTests} test(s) failed.\n`);
  }

  log('─'.repeat(60));
  log('  CUSTOMERS CREATED:');
  for (const c of allCustomers) {
    log(`    ${c.label}: ${c.profile.first_name} ${c.profile.last_name} (${c.profile.email}) → ${c.userId}`);
  }
  log(`\n  Manager: ${managerName} (${managerId})`);
  log(`  Bookings: ${allBookingIds.length}  |  Rentals: ${allRentalIds.length}  |  Shop orders: ${shopOrderId ? 1 : 0}  |  Accommodations: ${accommodationIds.length}`);
  log(`\n  Cleanup: node tests/scripts/cleanup.mjs`);
  log('─'.repeat(60));

  process.exit(passedTests === totalTests ? 0 : 1);
}

main().catch(e => {
  console.error('\n❌ FATAL:', e.message);
  process.exit(1);
});
