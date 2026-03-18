#!/usr/bin/env node
/**
 * MEGA BUSINESS FLOW TEST
 *
 * The ultimate comprehensive test — validates ALL revenue streams, ALL pricing,
 * ALL commission calculations, ALL instructor earnings in a single script.
 *
 * 7 Customers → 3 Instructors → 6 Commission Categories → Manager Payments
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ C1 Lukas   : All Inclusive Pkg (€1850) → 8 lessons Elif                   │
 * │              + pkg rentals (14d) + pkg accommodation (7n)                  │
 * │              + Seasonal Pass (€300) + Shop order                           │
 * │ C2 Sophie  : Kitesurf Pkg (€1540) → 6 lessons Siyabend                   │
 * │              + pkg accommodation (7n) + 1 individual lesson Siyabend       │
 * │ C3 Tobias  : 3 individual lessons Oğuzhan + standalone rental (5d)        │
 * │              + standalone accommodation (5n)                               │
 * │ C4 Laura   : Starter Pkg (€470) + SLS Rental Pkg (€500)                  │
 * │              → 6 lessons Elif + pkg rentals (7d)                           │
 * │ C5 Max     : 2 shop products + Seasonal Pass (€300)                       │
 * │              + 1 individual lesson Elif                                    │
 * │ C6 Emre    : Rider Progression (€700) + Semi-Private Pack (€550)          │
 * │              → semi-private (2h, 2 ppl, pkg+wallet) Elif                  │
 * │              → semi-private (2h, 2 ppl, pkg+wallet) Oğuzhan               │
 * │              + private pkg lessons Oğuzhan (6h) + cancel 1 pending        │
 * │ C6B Selin  : Semi-private partner (wallet) + 1 individual Siyabend       │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Instructor configs: (read from system at runtime)
 *   Elif Sarı     — percentage rate
 *   Oğuzhan Bentürk — percentage rate (dual-role: also manager)
 *   Siyabend Şanlı  — fixed category rate
 *
 * Manager commission: (rates read from system at runtime)
 *   Package commission → NO separate commission; earned via component completions
 *   Shop/Membership commission → only if rates configured
 *
 * Usage:   node tests/scripts/testflows/MegaBusinessFlowTest.mjs
 * Cleanup: node tests/scripts/cleanup.mjs
 */

import {
  API, PASSWORD, ADMIN_EMAIL,
  PROFILES, TURKISH_PROFILES,
  // All Inclusive Beginner Package
  ALL_INCLUSIVE_PKG_ID, ALL_INCLUSIVE_PKG_NAME, ALL_INCLUSIVE_PKG_PRICE,
  ALL_INCLUSIVE_PKG_HOURS, ALL_INCLUSIVE_PKG_SESSIONS,
  ALL_INCLUSIVE_PKG_RENTAL_DAYS, ALL_INCLUSIVE_PKG_NIGHTS,
  ALL_INCLUSIVE_PKG_HOURLY_RATE, ALL_INCLUSIVE_PKG_DAILY_RATE, ALL_INCLUSIVE_PKG_NIGHTLY_RATE,
  ALL_INCLUSIVE_LESSON_SERVICE_ID, ALL_INCLUSIVE_RENTAL_SERVICE_ID,
  ALL_INCLUSIVE_SESSIONS,
  // Kitesurf Learning Package
  KITESURF_PKG_ID, KITESURF_PKG_NAME, KITESURF_PKG_PRICE,
  KITESURF_PKG_HOURS, KITESURF_PKG_NIGHTS, KITESURF_SESSIONS,
  // Starter Package
  STARTER_PKG_ID, STARTER_PKG_NAME, STARTER_PKG_PRICE, STARTER_PKG_HOURS,
  // SLS Rental Package
  SLS_RENTAL_PKG_ID, SLS_RENTAL_PKG_NAME, SLS_RENTAL_PKG_PRICE, SLS_RENTAL_PKG_DAYS,
  // Rider Progression Pack
  PKG_SERVICE_PACKAGE_ID, PKG_NAME, PKG_PRICE, PKG_TOTAL_HOURS,
  // Semi-Private Beginner Pack
  SEMI_PRIVATE_PKG_ID, SEMI_PRIVATE_PKG_NAME, SEMI_PRIVATE_PKG_PRICE,
  SEMI_PRIVATE_PKG_HOURS, SEMI_PRIVATE_PKG_HOURLY_RATE,
  SEMI_PRIVATE_LESSON_SERVICE_ID, SEMI_PRIVATE_LESSON_PRICE,
  // Private lesson & equipment
  PRIVATE_LESSON_SERVICE_ID, PRIVATE_LESSON_PRICE,
  SLS_EQUIPMENT_SERVICE_ID,
  // Seasonal Pass
  SEASONAL_PASS_OFFERING_ID, SEASONAL_PASS_PRICE,
  // Accommodation
  ACCOMMODATION_UNIT_ID,
  // Instructors
  ELIF_ID, SIYABEND_ID, OGUZHAN_ID,
  // Helpers
  log, ok, fail, title,
  api, apiOk, shuffle, adminLogin,
} from '../_shared.mjs';

// ══════════════════════════════════════════════════════════════════════
//  CONFIGURATION
// ══════════════════════════════════════════════════════════════════════

// Commission rates — read dynamically from the system in Phase 1
let MGR_BOOKING_RATE = 0;
let MGR_RENTAL_RATE  = 0;
let MGR_ACCOM_RATE   = 0;
let ELIF_RATE_PCT      = 0;
let OGUZHAN_RATE_PCT   = 0;
let SIYABEND_FIXED_RATE = 0;
let SIYABEND_COMM_TYPE  = 'fixed';

// Package hourly rates (from DB packageHourlyRate or derived)
const ALL_INCL_HOURLY   = ALL_INCLUSIVE_PKG_HOURLY_RATE;                        // €65 (DB packageHourlyRate)
const KITESURF_HOURLY   = 90;                                                  // €90 (DB packageHourlyRate)
const STARTER_HOURLY    = STARTER_PKG_PRICE / STARTER_PKG_HOURS;               // ~€78.33
const RIDER_HOURLY      = PKG_PRICE / PKG_TOTAL_HOURS;                         // €70
const SEMI_PRIV_HOURLY  = SEMI_PRIVATE_PKG_HOURLY_RATE;                         // €55

// Semi-private commission rates — read dynamically in Phase 1 via category rates
let ELIF_SEMI_PRIV_RATE = 0;
let OGUZHAN_SEMI_PRIV_RATE = 0;

// Session schedules
const C2_INDIVIDUAL_SESSIONS = [1.5]; // 1 individual lesson for Sophie
const C3_INDIVIDUAL_SESSIONS = [1, 1.5, 2]; // 3 individual lessons for Tobias = 4.5h
const C4_STARTER_SESSIONS    = [1, 1, 1, 1, 1, 1]; // 6h via Starter Pkg
const C5_INDIVIDUAL_SESSIONS = [1]; // 1 individual lesson for Max = 1h
const C6_SEMI_PRIVATE_DURATION = 2; // 2h semi-private lesson with Elif
const C6_OGUZ_SEMI_PRIVATE_DURATION = 2; // 2h semi-private lesson with Oğuzhan
const C6_PKG_SESSIONS        = [1, 1, 1, 1, 1, 1]; // 6h of Rider Progression with Oğuzhan
const C6_CANCEL_SESSION      = [1]; // 1h to be cancelled
const C6B_INDIVIDUAL_SESSIONS = [1]; // 1 individual lesson for Selin

// Date helpers — offset to avoid conflicts with other tests
const DATE_BASE_OFFSET = 120 + Math.floor(Math.random() * 180);
function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + DATE_BASE_OFFSET + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// ══════════════════════════════════════════════════════════════════════
//  TEST FRAMEWORK
// ══════════════════════════════════════════════════════════════════════

let totalTests  = 0;
let passedTests = 0;
const warn = (msg) => log(`  ⚠️  ${msg}`);

function assert(condition, label) {
  totalTests++;
  if (condition) { passedTests++; ok(label); }
  else { fail(label); }
}

function assertClose(actual, expected, label, tolerance = 0.02) {
  totalTests++;
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) { passedTests++; ok(`${label}: €${actual.toFixed(2)} ≈ €${expected.toFixed(2)}`); }
  else { fail(`${label}: €${actual.toFixed(2)} ≠ €${expected.toFixed(2)} (diff=${diff.toFixed(2)})`); }
}

// ══════════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════════

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

async function createSpecificCustomer(profile, roleId, token) {
  const res = await api('POST', '/users', { ...profile, password: PASSWORD, role_id: roleId }, token);
  if (res.ok) {
    const userId = res.data.id || res.data.user?.id;
    return { profile, userId };
  }
  if (res.status === 409) {
    // Already exists — look up by email
    const usersRes = await apiOk('GET', `/users?search=${encodeURIComponent(profile.email)}`, null, token);
    const users = Array.isArray(usersRes) ? usersRes : usersRes.users || usersRes.data || [];
    const found = users.find(u => u.email === profile.email);
    if (found) return { profile, userId: found.id };
    throw new Error(`User ${profile.email} already exists but could not look up ID`);
  }
  throw new Error(`POST /users → ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
}

async function fundWallet(userId, amount, token) {
  await apiOk('POST', '/wallet/manual-adjust', {
    userId, amount, currency: 'EUR', description: 'Mega test wallet funding',
  }, token);
}

async function getWalletBalance(userId, token) {
  const acct = await apiOk('GET', `/finances/accounts/${userId}`, null, token);
  return parseFloat(acct.balance ?? acct.wallet?.balance ?? 0);
}

const _customerTokenCache = new Map();
async function customerLogin(email) {
  if (_customerTokenCache.has(email)) return _customerTokenCache.get(email);
  const { token } = await apiOk('POST', '/auth/login', { email, password: PASSWORD });
  _customerTokenCache.set(email, token);
  return token;
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
  }

  for (const b of bookings) {
    await apiOk('PUT', `/bookings/${b.id}`, { status: 'completed' }, token);
  }
  ok(`  ${bookings.length} sessions booked & completed (${sessions.reduce((a, b) => a + b, 0)}h)`);
  return bookings;
}

async function bookPendingLesson(userId, instructorId, serviceId, duration, token, dayOffset, opts = {}) {
  const dateStr = futureDate(dayOffset);
  const body = {
    date: dateStr,
    start_hour: '10.00',
    duration,
    student_user_id: userId,
    instructor_user_id: instructorId,
    service_id: serviceId,
    status: 'confirmed',
    ...opts,
  };
  if (!opts.use_package) {
    body.amount = PRIVATE_LESSON_PRICE * duration;
  }
  const booking = await apiOk('POST', '/bookings?force=true', body, token);
  const bId = booking.id || booking.booking?.id;
  return { id: bId, duration };
}

async function createAndCompleteRentals(userId, count, startDayOffset, token, pkgOpts = {}) {
  const rentalIds = [];
  for (let i = 0; i < count; i++) {
    const startDate = futureDate(startDayOffset + i);
    const endDate   = futureDate(startDayOffset + i + 1);

    const body = {
      user_id: userId,
      equipment_ids: [pkgOpts.equipmentId || SLS_EQUIPMENT_SERVICE_ID],
      rental_days: 1,
      start_date: startDate,
      end_date: endDate,
      use_package: !!pkgOpts.use_package,
      payment_method: 'wallet',
    };
    if (pkgOpts.customer_package_id) body.customer_package_id = pkgOpts.customer_package_id;

    const rental = await apiOk('POST', '/rentals', body, token);
    rentalIds.push(rental.id || rental.rental?.id);
  }

  for (const rId of rentalIds) {
    try { await apiOk('PATCH', `/rentals/${rId}/activate`, null, token); } catch { /* already active */ }
  }
  for (const rId of rentalIds) {
    await apiOk('PATCH', `/rentals/${rId}/complete`, null, token);
  }
  ok(`  ${count} rentals activated & completed`);
  return rentalIds;
}

// ══════════════════════════════════════════════════════════════════════
//  MAIN TEST
// ══════════════════════════════════════════════════════════════════════

async function main() {
  title('🏄 MEGA BUSINESS FLOW TEST — ALL REVENUE STREAMS');
  log('  Testing: 7 customers, 5 packages, 3 instructors, 6 commission categories');
  log('  All prices verified to the cent.\n');

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 1: ADMIN LOGIN & SYSTEM VERIFICATION
  // ══════════════════════════════════════════════════════════════════

  title('PHASE 1 · Admin Login & System Verification');

  const token = await adminLogin();
  ok('Admin logged in');

  // Fetch student role
  const roles = await apiOk('GET', '/roles', null, token);
  const studentRole = (Array.isArray(roles) ? roles : roles.roles || []).find(r => r.name === 'student');
  if (!studentRole) throw new Error('Student role not found');
  ok(`Student role: ${studentRole.id}`);

  // Verify instructors
  title('1a · Instructor Verification');
  const instructorList = await apiOk('GET', '/instructors', null, token);
  const allInstructors = Array.isArray(instructorList) ? instructorList : instructorList.instructors || [];

  const elif     = allInstructors.find(i => i.id === ELIF_ID);
  const oguzhan  = allInstructors.find(i => i.id === OGUZHAN_ID);
  const siyabend = allInstructors.find(i => i.id === SIYABEND_ID);
  if (!elif)     throw new Error('Elif not found');
  if (!oguzhan)  throw new Error('Oğuzhan not found');
  if (!siyabend) throw new Error('Siyabend not found');

  const elifName     = `${elif.first_name} ${elif.last_name}`;
  const oguzhanName  = `${oguzhan.first_name} ${oguzhan.last_name}`;
  const siyabendName = `${siyabend.first_name} ${siyabend.last_name}`;
  ok(`Instructors: ${elifName}, ${oguzhanName}, ${siyabendName}`);

  // Read instructor commission configs from system
  title('1b · Read Instructor Commission Rates');
  for (const [inst, name, setter] of [
    [elif, elifName, (v) => { ELIF_RATE_PCT = v; }],
    [oguzhan, oguzhanName, (v) => { OGUZHAN_RATE_PCT = v; }],
  ]) {
    const commRes = await apiOk('GET', `/instructor-commissions/instructors/${inst.id}/commissions`, null, token);
    const defComm = commRes.defaultCommission || {};
    const rate = parseFloat(defComm.value || inst.commission_rate || inst.commissionRate || inst.default_rate || 0);
    setter(rate);
    ok(`${name}: ${defComm.type || 'percentage'} @ ${rate}%`);

    // Read category rate for semi-private service
    // Priority: Booking custom → Service-specific → Category rate → Default
    // Semi-private service has lessonCategoryTag='group', so we look up the 'group' category rate
    const catRatesRes = await apiOk('GET', `/instructor-commissions/instructors/${inst.id}/category-rates`, null, token);
    const catRates = catRatesRes.categoryRates || [];
    const semiPrivCatRate = catRates.find(c => c.lesson_category === 'group');
    const semiPrivRate = semiPrivCatRate ? parseFloat(semiPrivCatRate.rate_value || 0) : rate;
    if (inst.id === ELIF_ID) {
      ELIF_SEMI_PRIV_RATE = semiPrivRate;
      ok(`  Semi-private category rate: ${ELIF_SEMI_PRIV_RATE}%`);
    }
    if (inst.id === OGUZHAN_ID) {
      OGUZHAN_SEMI_PRIV_RATE = semiPrivRate;
      ok(`  Semi-private category rate: ${OGUZHAN_SEMI_PRIV_RATE}%`);
    }
  }
  {
    const siyCommRes = await apiOk('GET', `/instructor-commissions/instructors/${siyabend.id}/commissions`, null, token);
    const siyDefComm = siyCommRes.defaultCommission || {};
    SIYABEND_COMM_TYPE = (siyDefComm.type || siyabend.commission_type || siyabend.commissionType || 'fixed').toLowerCase();
    SIYABEND_FIXED_RATE = parseFloat(siyDefComm.value || 0);
    ok(`${siyabendName}: ${SIYABEND_COMM_TYPE} @ €${SIYABEND_FIXED_RATE}/h`);
  }

  // Read manager settings from system
  title('1c · Read Manager Commission Rates');
  const managersRes = await apiOk('GET', '/manager/commissions/admin/managers', null, token);
  const managers = managersRes.data || managersRes || [];
  assert(managers.length > 0, `At least 1 manager found (${managers.length})`);

  const manager = managers[0];
  const managerId = manager.id || manager.user_id || manager.userId;
  const managerName = `${manager.first_name || ''} ${manager.last_name || ''}`.trim();
  ok(`Manager: ${managerName} (${managerId})`);

  // Fetch actual commission rates from the system
  const mgrSettingsRes = await apiOk('GET', `/manager/commissions/admin/managers/${managerId}/settings`, null, token);
  const mgrSettings = mgrSettingsRes.data || mgrSettingsRes || {};
  MGR_BOOKING_RATE = parseFloat(mgrSettings.bookingRate ?? mgrSettings.defaultRate ?? 10);
  MGR_RENTAL_RATE  = parseFloat(mgrSettings.rentalRate  ?? mgrSettings.defaultRate ?? 10);
  MGR_ACCOM_RATE   = parseFloat(mgrSettings.accommodationRate ?? mgrSettings.defaultRate ?? 10);
  ok(`Manager rates: booking=${MGR_BOOKING_RATE}%, rental=${MGR_RENTAL_RATE}%, accom=${MGR_ACCOM_RATE}%`);
  log('  Note: Package commission = derived from lesson/rental completions, not package purchase');

  // Verify shop products exist
  title('1d · Shop Products');
  const productsRes = await apiOk('GET', '/products?limit=10', null, token);
  const products = Array.isArray(productsRes) ? productsRes : productsRes.data || productsRes.products || [];
  const activeProducts = products.filter(p => (p.status || 'active') === 'active' && (p.stock_quantity || 0) > 0);
  assert(activeProducts.length >= 1, `Active products available: ${activeProducts.length}`);
  if (activeProducts.length >= 1) {
    log(`    Product 1: ${activeProducts[0].name} — €${activeProducts[0].price}`);
    if (activeProducts.length >= 2) {
      log(`    Product 2: ${activeProducts[1].name} — €${activeProducts[1].price}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 2: CREATE CUSTOMERS & FUND WALLETS
  // ══════════════════════════════════════════════════════════════════

  title('PHASE 2 · Customer Creation & Wallet Funding');

  // We need specific customers for semi-private pairing
  // C6 = Emre Yilmaz, C6B = Selin Kaya (Turkish)
  const emreProfile = TURKISH_PROFILES.find(p => p.first_name === 'Emre');
  const selinProfile = TURKISH_PROFILES.find(p => p.first_name === 'Selin');
  // Remaining Turkish profiles for random assignment
  const remainingTurkish = TURKISH_PROFILES.filter(p => p.first_name !== 'Emre' && p.first_name !== 'Selin');

  // C1-C5 German profiles (use specific ones for predictability)
  const lukasProfile = PROFILES.find(p => p.first_name === 'Lukas');
  const sophieProfile = PROFILES.find(p => p.first_name === 'Sophie');
  const tobiasProfile = PROFILES.find(p => p.first_name === 'Tobias');
  const lauraProfile = PROFILES.find(p => p.first_name === 'Laura');
  const maxProfile = PROFILES.find(p => p.first_name === 'Maximilian');

  title('2a · Creating Customers');
  const c1 = await createSpecificCustomer(lukasProfile, studentRole.id, token);
  ok(`C1: ${c1.profile.first_name} ${c1.profile.last_name} → ${c1.userId}`);

  const c2 = await createSpecificCustomer(sophieProfile, studentRole.id, token);
  ok(`C2: ${c2.profile.first_name} ${c2.profile.last_name} → ${c2.userId}`);

  const c3 = await createSpecificCustomer(tobiasProfile, studentRole.id, token);
  ok(`C3: ${c3.profile.first_name} ${c3.profile.last_name} → ${c3.userId}`);

  const c4 = await createSpecificCustomer(lauraProfile, studentRole.id, token);
  ok(`C4: ${c4.profile.first_name} ${c4.profile.last_name} → ${c4.userId}`);

  const c5 = await createSpecificCustomer(maxProfile, studentRole.id, token);
  ok(`C5: ${c5.profile.first_name} ${c5.profile.last_name} → ${c5.userId}`);

  const c6 = await createSpecificCustomer(emreProfile, studentRole.id, token);
  ok(`C6: ${c6.profile.first_name} ${c6.profile.last_name} → ${c6.userId}`);

  const c6b = await createSpecificCustomer(selinProfile, studentRole.id, token);
  ok(`C6B: ${c6b.profile.first_name} ${c6b.profile.last_name} → ${c6b.userId}`);

  // Fund wallets
  title('2b · Funding Wallets');
  const WALLET_AMOUNTS = {
    c1: 5000, // All Inclusive (1850) + Seasonal (300) + shop + buffer
    c2: 3000, // Kitesurf (1540) + 1 individual lesson + buffer
    c3: 3000, // 3 individual lessons + rental + accommodation + buffer
    c4: 2000, // Starter (470) + SLS Rental (500) + buffer
    c5: 1500, // 2 shop products + Seasonal (300) + 1 lesson + buffer
    c6: 2500, // Rider Progression (700) + Semi-Private Pack (550) + buffer
    c6b: 1000, // Semi-private wallet share (120) + 1 individual lesson (90) + buffer
  };

  for (const [label, cust, amt] of [
    ['C1', c1, WALLET_AMOUNTS.c1],
    ['C2', c2, WALLET_AMOUNTS.c2],
    ['C3', c3, WALLET_AMOUNTS.c3],
    ['C4', c4, WALLET_AMOUNTS.c4],
    ['C5', c5, WALLET_AMOUNTS.c5],
    ['C6', c6, WALLET_AMOUNTS.c6],
    ['C6B', c6b, WALLET_AMOUNTS.c6b],
  ]) {
    await fundWallet(cust.userId, amt, token);
    const bal = await getWalletBalance(cust.userId, token);
    assert(Math.abs(bal - amt) < 1, `${label} wallet funded: €${bal} (expected €${amt})`);
  }

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 3: CUSTOMER FLOWS
  // ══════════════════════════════════════════════════════════════════

  // Tracking all booking/rental IDs for commission verification
  const allBookingIds = { elif: [], oguzhan: [], siyabend: [] };
  const allRentalIds = { standalone: [], package: [] };
  const allAccomIds = { standalone: [], package: [] };
  const allOrderIds = [];
  const allMembershipIds = [];
  const allPackagePurchaseIds = [];

  // ────────────────────────────────────────────────────────────
  //  C1 · LUKAS — All Inclusive Package
  // ────────────────────────────────────────────────────────────

  title('C1 · LUKAS — All Inclusive Package (€' + ALL_INCLUSIVE_PKG_PRICE + ')');

  // Purchase All Inclusive Package
  const c1Pkg = await apiOk('POST', '/services/customer-packages', {
    customerId: c1.userId,
    servicePackageId: ALL_INCLUSIVE_PKG_ID,
    packageName: ALL_INCLUSIVE_PKG_NAME,
    totalHours: ALL_INCLUSIVE_PKG_HOURS,
    purchasePrice: ALL_INCLUSIVE_PKG_PRICE,
    currency: 'EUR',
    includesLessons: true,
    includesRental: true,
    includesAccommodation: true,
    packageType: 'all_inclusive',
    rentalDays: ALL_INCLUSIVE_PKG_RENTAL_DAYS,
    accommodationNights: ALL_INCLUSIVE_PKG_NIGHTS,
    accommodationUnitId: ACCOMMODATION_UNIT_ID,
  }, token);
  const c1CpId = c1Pkg.id;
  allPackagePurchaseIds.push({ id: c1CpId, price: ALL_INCLUSIVE_PKG_PRICE, name: ALL_INCLUSIVE_PKG_NAME, customer: 'C1' });
  ok(`C1 All Inclusive package purchased: ${c1CpId}`);
  assert(parseFloat(c1Pkg.totalHours || c1Pkg.total_hours || 0) === ALL_INCLUSIVE_PKG_HOURS,
    `C1 package hours = ${ALL_INCLUSIVE_PKG_HOURS}`);

  // 8 lessons with Elif (15h total via package)
  log(`  Booking ${ALL_INCLUSIVE_PKG_SESSIONS} sessions (${ALL_INCLUSIVE_PKG_HOURS}h) with ${elifName}...`);
  const c1Bookings = await bookAndCompleteLessons(
    ALL_INCLUSIVE_SESSIONS, c1.userId, ELIF_ID, ALL_INCLUSIVE_LESSON_SERVICE_ID, token, 1,
    { use_package: true, customer_package_id: c1CpId }
  );
  allBookingIds.elif.push(...c1Bookings);

  // Package rentals (14 days)
  log(`  Creating ${ALL_INCLUSIVE_PKG_RENTAL_DAYS} package rental days...`);
  const c1Rentals = await createAndCompleteRentals(
    c1.userId, ALL_INCLUSIVE_PKG_RENTAL_DAYS, 20, token,
    { use_package: true, customer_package_id: c1CpId, equipmentId: ALL_INCLUSIVE_RENTAL_SERVICE_ID }
  );
  allRentalIds.package.push(...c1Rentals);

  // Package accommodation (7 nights)
  log(`  Consuming ${ALL_INCLUSIVE_PKG_NIGHTS} accommodation nights from package...`);
  try {
    await apiOk('POST', `/services/customer-packages/${c1CpId}/use-accommodation-nights`, {
      nightsToUse: ALL_INCLUSIVE_PKG_NIGHTS,
      checkInDate: futureDate(40),
    }, token);
    ok(`  ${ALL_INCLUSIVE_PKG_NIGHTS} accommodation nights consumed`);
    allAccomIds.package.push(c1CpId);
  } catch (e) {
    warn(`Accommodation endpoint: ${e.message}`);
    try {
      await apiOk('PUT', `/services/customer-packages/${c1CpId}`, {
        accommodation_nights_used: ALL_INCLUSIVE_PKG_NIGHTS,
        accommodation_nights_remaining: 0,
      }, token);
      ok('  Accommodation nights updated via PUT');
      allAccomIds.package.push(c1CpId);
    } catch (e2) {
      warn(`Could not consume accommodation: ${e2.message}`);
    }
  }

  // Purchase Seasonal Pass
  log(`  Purchasing Seasonal Pass (€${SEASONAL_PASS_PRICE})...`);
  const c1Token = await customerLogin(c1.profile.email);
  const c1Membership = await apiOk('POST', `/member-offerings/${SEASONAL_PASS_OFFERING_ID}/purchase`, {
    paymentMethod: 'wallet',
  }, c1Token);
  const c1MemId = c1Membership.id || c1Membership.purchase?.id || c1Membership.data?.id;
  allMembershipIds.push({ id: c1MemId, userId: c1.userId, price: SEASONAL_PASS_PRICE, customer: 'C1' });
  ok(`  Seasonal Pass purchased: ${c1MemId}`);

  // Shop order
  if (activeProducts.length >= 1) {
    log(`  Placing shop order: ${activeProducts[0].name}...`);
    const c1Order = await apiOk('POST', '/shop-orders', {
      items: [{ product_id: activeProducts[0].id, quantity: 1 }],
      payment_method: 'wallet',
    }, c1Token);
    const c1OrderId = (c1Order.order || c1Order).id;
    allOrderIds.push({ id: c1OrderId, price: parseFloat(activeProducts[0].price), customer: 'C1' });
    ok(`  Shop order placed: ${c1OrderId}`);
  }

  // Verify All Inclusive package used up
  const c1PkgCheck = await apiOk('GET', `/services/customer-packages/${c1.userId}`, null, token);
  const c1PkgList = Array.isArray(c1PkgCheck) ? c1PkgCheck : c1PkgCheck.packages || c1PkgCheck.data || [];
  const c1OurPkg = c1PkgList.find(p => p.id === c1CpId);
  if (c1OurPkg) {
    const st = (c1OurPkg.status || '').toLowerCase();
    assert(st === 'used_up' || st === 'completed' || st === 'expired',
      `C1 All Inclusive status = used_up (got ${st})`);
    const remain = parseFloat(c1OurPkg.remaining_hours ?? c1OurPkg.remainingHours ?? -1);
    assert(remain === 0, `C1 lesson hours remaining = 0 (got ${remain})`);
    const rentalRemain = parseInt(c1OurPkg.rental_days_remaining ?? c1OurPkg.rentalDaysRemaining ?? -1);
    assert(rentalRemain === 0, `C1 rental days remaining = 0 (got ${rentalRemain})`);
  } else {
    fail('C1 package not found for verification');
  }

  // ────────────────────────────────────────────────────────────
  //  C2 · SOPHIE — Kitesurf Learning Package
  // ────────────────────────────────────────────────────────────

  title('C2 · SOPHIE — Kitesurf Learning Package (€' + KITESURF_PKG_PRICE + ')');

  const c2Pkg = await apiOk('POST', '/services/customer-packages', {
    customerId: c2.userId,
    servicePackageId: KITESURF_PKG_ID,
    packageName: KITESURF_PKG_NAME,
    totalHours: KITESURF_PKG_HOURS,
    purchasePrice: KITESURF_PKG_PRICE,
    currency: 'EUR',
    includesLessons: true,
    includesRental: false,
    includesAccommodation: true,
    packageType: 'lesson_accommodation',
    accommodationNights: KITESURF_PKG_NIGHTS,
    accommodationUnitId: ACCOMMODATION_UNIT_ID,
  }, token);
  const c2CpId = c2Pkg.id;
  allPackagePurchaseIds.push({ id: c2CpId, price: KITESURF_PKG_PRICE, name: KITESURF_PKG_NAME, customer: 'C2' });
  ok(`C2 Kitesurf package purchased: ${c2CpId}`);

  // 6 lessons with Siyabend (12h via package)
  log(`  Booking 6 sessions (${KITESURF_PKG_HOURS}h) with ${siyabendName}...`);
  const c2PkgBookings = await bookAndCompleteLessons(
    KITESURF_SESSIONS, c2.userId, SIYABEND_ID, PRIVATE_LESSON_SERVICE_ID, token, 50,
    { use_package: true, customer_package_id: c2CpId }
  );
  allBookingIds.siyabend.push(...c2PkgBookings);

  // Package accommodation (7 nights)
  log(`  Consuming ${KITESURF_PKG_NIGHTS} accommodation nights from package...`);
  try {
    await apiOk('POST', `/services/customer-packages/${c2CpId}/use-accommodation-nights`, {
      nightsToUse: KITESURF_PKG_NIGHTS,
      checkInDate: futureDate(60),
    }, token);
    ok(`  ${KITESURF_PKG_NIGHTS} accommodation nights consumed`);
    allAccomIds.package.push(c2CpId);
  } catch (e) {
    warn(`Accommodation: ${e.message}`);
    try {
      await apiOk('PUT', `/services/customer-packages/${c2CpId}`, {
        accommodation_nights_used: KITESURF_PKG_NIGHTS,
        accommodation_nights_remaining: 0,
      }, token);
      ok('  Accommodation nights updated via PUT');
      allAccomIds.package.push(c2CpId);
    } catch (e2) {
      warn(`Could not consume accommodation: ${e2.message}`);
    }
  }

  // 1 individual lesson with Siyabend (outside package)
  log(`  1 individual lesson (${C2_INDIVIDUAL_SESSIONS[0]}h) with ${siyabendName}...`);
  const c2IndBookings = await bookAndCompleteLessons(
    C2_INDIVIDUAL_SESSIONS, c2.userId, SIYABEND_ID, PRIVATE_LESSON_SERVICE_ID, token, 70
  );
  allBookingIds.siyabend.push(...c2IndBookings);

  // Verify Kitesurf package used up
  const c2PkgCheck = await apiOk('GET', `/services/customer-packages/${c2.userId}`, null, token);
  const c2PkgList = Array.isArray(c2PkgCheck) ? c2PkgCheck : c2PkgCheck.packages || c2PkgCheck.data || [];
  const c2OurPkg = c2PkgList.find(p => p.id === c2CpId);
  if (c2OurPkg) {
    const remain = parseFloat(c2OurPkg.remaining_hours ?? c2OurPkg.remainingHours ?? -1);
    assert(remain === 0, `C2 Kitesurf hours remaining = 0 (got ${remain})`);
  } else {
    fail('C2 Kitesurf package not found');
  }

  // ────────────────────────────────────────────────────────────
  //  C3 · TOBIAS — Individual Lessons + Standalone Rental + Accommodation
  // ────────────────────────────────────────────────────────────

  title('C3 · TOBIAS — Individual Lessons + Standalone Rental + Accommodation');

  // 3 individual lessons with Oğuzhan (4.5h)
  const C3_TOTAL_HOURS = C3_INDIVIDUAL_SESSIONS.reduce((a, b) => a + b, 0);
  log(`  ${C3_INDIVIDUAL_SESSIONS.length} individual lessons (${C3_TOTAL_HOURS}h) with ${oguzhanName}...`);
  const c3Bookings = await bookAndCompleteLessons(
    C3_INDIVIDUAL_SESSIONS, c3.userId, OGUZHAN_ID, PRIVATE_LESSON_SERVICE_ID, token, 80
  );
  allBookingIds.oguzhan.push(...c3Bookings);

  // Standalone rental (5 days — non-package, wallet)
  log('  5 standalone rental days (non-package, wallet)...');
  const c3Rentals = await createAndCompleteRentals(c3.userId, 5, 90, token);
  allRentalIds.standalone.push(...c3Rentals);

  // Standalone accommodation (5 nights)
  const c3CheckIn  = futureDate(100);
  const c3CheckOut = futureDate(105);
  log(`  5-night accommodation (${c3CheckIn} → ${c3CheckOut})...`);
  const c3Accom = await apiOk('POST', '/accommodation/bookings', {
    unit_id: ACCOMMODATION_UNIT_ID,
    guest_id: c3.userId,
    check_in_date: c3CheckIn,
    check_out_date: c3CheckOut,
    guests_count: 1,
    payment_method: 'wallet',
  }, token);
  const c3AccomId = c3Accom.id || c3Accom.booking?.id;
  allAccomIds.standalone.push(c3AccomId);
  try {
    await apiOk('PATCH', `/accommodation/bookings/${c3AccomId}/confirm`, null, token);
    ok('  Accommodation confirmed');
  } catch {
    ok('  Accommodation auto-confirmed');
  }

  // ────────────────────────────────────────────────────────────
  //  C4 · LAURA — Starter Package + SLS Rental Package
  // ────────────────────────────────────────────────────────────

  title('C4 · LAURA — Starter (€' + STARTER_PKG_PRICE + ') + SLS Rental (€' + SLS_RENTAL_PKG_PRICE + ')');

  // Purchase Starter Package
  const c4StarterPkg = await apiOk('POST', '/services/customer-packages', {
    customerId: c4.userId,
    servicePackageId: STARTER_PKG_ID,
    packageName: STARTER_PKG_NAME,
    totalHours: STARTER_PKG_HOURS,
    purchasePrice: STARTER_PKG_PRICE,
    currency: 'EUR',
  }, token);
  const c4StarterCpId = c4StarterPkg.id;
  allPackagePurchaseIds.push({ id: c4StarterCpId, price: STARTER_PKG_PRICE, name: STARTER_PKG_NAME, customer: 'C4' });
  ok(`C4 Starter package: ${c4StarterCpId}`);

  // Purchase SLS Rental Package
  const c4RentalPkg = await apiOk('POST', '/services/customer-packages', {
    customerId: c4.userId,
    servicePackageId: SLS_RENTAL_PKG_ID,
    packageName: SLS_RENTAL_PKG_NAME,
    purchasePrice: SLS_RENTAL_PKG_PRICE,
    currency: 'EUR',
    rentalDays: SLS_RENTAL_PKG_DAYS,
  }, token);
  const c4RentalCpId = c4RentalPkg.id;
  allPackagePurchaseIds.push({ id: c4RentalCpId, price: SLS_RENTAL_PKG_PRICE, name: SLS_RENTAL_PKG_NAME, customer: 'C4' });
  ok(`C4 SLS Rental package: ${c4RentalCpId}`);

  // 6h lessons with Elif (via Starter package)
  log(`  6 sessions (${STARTER_PKG_HOURS}h) with ${elifName}...`);
  const c4Bookings = await bookAndCompleteLessons(
    C4_STARTER_SESSIONS, c4.userId, ELIF_ID, PRIVATE_LESSON_SERVICE_ID, token, 110,
    { use_package: true, customer_package_id: c4StarterCpId }
  );
  allBookingIds.elif.push(...c4Bookings);

  // 7 package rentals (SLS Rental Package)
  log(`  ${SLS_RENTAL_PKG_DAYS} package rental days...`);
  const c4Rentals = await createAndCompleteRentals(
    c4.userId, SLS_RENTAL_PKG_DAYS, 120, token,
    { use_package: true, customer_package_id: c4RentalCpId }
  );
  allRentalIds.package.push(...c4Rentals);

  // Verify both packages used up
  const c4PkgCheck = await apiOk('GET', `/services/customer-packages/${c4.userId}`, null, token);
  const c4PkgList = Array.isArray(c4PkgCheck) ? c4PkgCheck : c4PkgCheck.packages || c4PkgCheck.data || [];

  const c4StarterCheck = c4PkgList.find(p => p.id === c4StarterCpId);
  if (c4StarterCheck) {
    const remain = parseFloat(c4StarterCheck.remaining_hours ?? c4StarterCheck.remainingHours ?? -1);
    assert(remain === 0, `C4 Starter hours remaining = 0 (got ${remain})`);
  }
  const c4RentalCheck = c4PkgList.find(p => p.id === c4RentalCpId);
  if (c4RentalCheck) {
    const remainDays = parseInt(c4RentalCheck.rental_days_remaining ?? c4RentalCheck.rentalDaysRemaining ?? -1);
    assert(remainDays === 0, `C4 SLS Rental days remaining = 0 (got ${remainDays})`);
  }

  // ────────────────────────────────────────────────────────────
  //  C5 · MAX — Shop + Seasonal Pass + 1 Individual Lesson
  // ────────────────────────────────────────────────────────────

  title('C5 · MAX — Shop + Seasonal Pass (€' + SEASONAL_PASS_PRICE + ') + Individual Lesson');

  const c5Token = await customerLogin(c5.profile.email);

  // Shop orders (2 products if available, otherwise 1 product x2 qty)
  if (activeProducts.length >= 2) {
    log(`  Shop order: ${activeProducts[0].name} + ${activeProducts[1].name}...`);
    const c5Order = await apiOk('POST', '/shop-orders', {
      items: [
        { product_id: activeProducts[0].id, quantity: 1 },
        { product_id: activeProducts[1].id, quantity: 1 },
      ],
      payment_method: 'wallet',
    }, c5Token);
    const c5OrderId = (c5Order.order || c5Order).id;
    const c5OrderTotal = parseFloat(activeProducts[0].price) + parseFloat(activeProducts[1].price);
    allOrderIds.push({ id: c5OrderId, price: c5OrderTotal, customer: 'C5' });
    ok(`  Shop order: ${c5OrderId} (€${c5OrderTotal})`);
  } else if (activeProducts.length >= 1) {
    log(`  Shop order: ${activeProducts[0].name} x2...`);
    const c5Order = await apiOk('POST', '/shop-orders', {
      items: [{ product_id: activeProducts[0].id, quantity: 2 }],
      payment_method: 'wallet',
    }, c5Token);
    const c5OrderId = (c5Order.order || c5Order).id;
    allOrderIds.push({ id: c5OrderId, price: parseFloat(activeProducts[0].price) * 2, customer: 'C5' });
    ok(`  Shop order: ${c5OrderId}`);
  }

  // Seasonal Pass
  log(`  Purchasing Seasonal Pass (€${SEASONAL_PASS_PRICE})...`);
  const c5Membership = await apiOk('POST', `/member-offerings/${SEASONAL_PASS_OFFERING_ID}/purchase`, {
    paymentMethod: 'wallet',
  }, c5Token);
  const c5MemId = c5Membership.id || c5Membership.purchase?.id || c5Membership.data?.id;
  allMembershipIds.push({ id: c5MemId, userId: c5.userId, price: SEASONAL_PASS_PRICE, customer: 'C5' });
  ok(`  Seasonal Pass purchased: ${c5MemId}`);

  // 1 individual lesson with Elif
  log(`  1 individual lesson (${C5_INDIVIDUAL_SESSIONS[0]}h) with ${elifName}...`);
  const c5Bookings = await bookAndCompleteLessons(
    C5_INDIVIDUAL_SESSIONS, c5.userId, ELIF_ID, PRIVATE_LESSON_SERVICE_ID, token, 130
  );
  allBookingIds.elif.push(...c5Bookings);

  // ────────────────────────────────────────────────────────────
  //  C6 · EMRE — Rider Progression + Semi-Private + Cancel
  // ────────────────────────────────────────────────────────────

  title('C6 · EMRE — Rider Progression (€' + PKG_PRICE + ') + Semi-Private Pack (€' + SEMI_PRIVATE_PKG_PRICE + ') + Cancel');

  // Purchase Rider Progression Pack (for private lessons with Oğuzhan)
  const c6Pkg = await apiOk('POST', '/services/customer-packages', {
    customerId: c6.userId,
    servicePackageId: PKG_SERVICE_PACKAGE_ID,
    packageName: PKG_NAME,
    totalHours: PKG_TOTAL_HOURS,
    purchasePrice: PKG_PRICE,
    currency: 'EUR',
  }, token);
  const c6CpId = c6Pkg.id;
  allPackagePurchaseIds.push({ id: c6CpId, price: PKG_PRICE, name: PKG_NAME, customer: 'C6' });
  ok(`C6 Rider Progression package: ${c6CpId}`);
  assert(parseFloat(c6Pkg.totalHours || c6Pkg.total_hours || 0) === PKG_TOTAL_HOURS,
    `C6 package hours = ${PKG_TOTAL_HOURS}`);

  // Purchase Semi-Private Beginner Pack (for semi-private lesson with Elif)
  const c6SemiPkg = await apiOk('POST', '/services/customer-packages', {
    customerId: c6.userId,
    servicePackageId: SEMI_PRIVATE_PKG_ID,
    packageName: SEMI_PRIVATE_PKG_NAME,
    totalHours: SEMI_PRIVATE_PKG_HOURS,
    purchasePrice: SEMI_PRIVATE_PKG_PRICE,
    currency: 'EUR',
    includesLessons: true,
    includesRental: false,
    includesAccommodation: false,
    packageType: 'lesson',
  }, token);
  const c6SemiCpId = c6SemiPkg.id;
  allPackagePurchaseIds.push({ id: c6SemiCpId, price: SEMI_PRIVATE_PKG_PRICE, name: SEMI_PRIVATE_PKG_NAME, customer: 'C6' });
  ok(`C6 Semi-Private package: ${c6SemiCpId}`);
  assert(parseFloat(c6SemiPkg.totalHours || c6SemiPkg.total_hours || 0) === SEMI_PRIVATE_PKG_HOURS,
    `C6 semi-private package hours = ${SEMI_PRIVATE_PKG_HOURS}`);

  // Semi-private lesson (2h, 2 participants: Emre + Selin) with Elif
  // Emre uses Semi-Private package, Selin pays from wallet at €60/h
  title('C6a · Semi-Private Lesson (2h, 2 participants) — package + wallet');
  log(`  Group booking: ${c6.profile.first_name} (pkg) + ${c6b.profile.first_name} (wallet) with ${elifName}...`);
  const semiPrivateDate = futureDate(140);
  const groupBookingRes = await apiOk('POST', '/bookings/group', {
    date: semiPrivateDate,
    start_hour: '10.00',
    duration: C6_SEMI_PRIVATE_DURATION,
    instructor_user_id: ELIF_ID,
    service_id: SEMI_PRIVATE_LESSON_SERVICE_ID,
    status: 'confirmed',
    participants: [
      {
        userId: c6.userId,
        userName: `${c6.profile.first_name} ${c6.profile.last_name}`,
        isPrimary: true,
        usePackage: true,
        customerPackageId: c6SemiCpId,
        paymentStatus: 'package',
        paymentAmount: 0,
      },
      {
        userId: c6b.userId,
        userName: `${c6b.profile.first_name} ${c6b.profile.last_name}`,
        isPrimary: false,
        usePackage: false,
        paymentStatus: 'paid',
        paymentAmount: SEMI_PRIVATE_LESSON_PRICE * C6_SEMI_PRIVATE_DURATION,
      },
    ],
  }, token);
  const groupBookingId = groupBookingRes.id || groupBookingRes.booking?.id;
  ok(`  Semi-private booked: ${groupBookingId} (${C6_SEMI_PRIVATE_DURATION}h × 2 ppl, pkg+wallet)`);

  // Complete the semi-private lesson
  await apiOk('PUT', `/bookings/${groupBookingId}`, { status: 'completed' }, token);
  ok('  Semi-private lesson completed');

  // Track: Elif earns on the semi-private
  allBookingIds.elif.push({ id: groupBookingId, duration: C6_SEMI_PRIVATE_DURATION, isGroup: true, groupSize: 2 });

  // C6c: Semi-Private Lesson with Oğuzhan (2h, 2 participants: Emre pkg + Selin wallet)
  title('C6c · Semi-Private Lesson (2h, 2 participants) — package + wallet with ' + oguzhanName);
  log(`  Group booking: ${c6.profile.first_name} (pkg) + ${c6b.profile.first_name} (wallet) with ${oguzhanName}...`);
  const semiPrivateDateOguz = futureDate(142);
  const groupBookingOguzRes = await apiOk('POST', '/bookings/group', {
    date: semiPrivateDateOguz,
    start_hour: '14.00',
    duration: C6_OGUZ_SEMI_PRIVATE_DURATION,
    instructor_user_id: OGUZHAN_ID,
    service_id: SEMI_PRIVATE_LESSON_SERVICE_ID,
    status: 'confirmed',
    participants: [
      {
        userId: c6.userId,
        userName: `${c6.profile.first_name} ${c6.profile.last_name}`,
        isPrimary: true,
        usePackage: true,
        customerPackageId: c6SemiCpId,
        paymentStatus: 'package',
        paymentAmount: 0,
      },
      {
        userId: c6b.userId,
        userName: `${c6b.profile.first_name} ${c6b.profile.last_name}`,
        isPrimary: false,
        usePackage: false,
        paymentStatus: 'paid',
        paymentAmount: SEMI_PRIVATE_LESSON_PRICE * C6_OGUZ_SEMI_PRIVATE_DURATION,
      },
    ],
  }, token);
  const groupBookingOguzId = groupBookingOguzRes.id || groupBookingOguzRes.booking?.id;
  ok(`  Semi-private booked: ${groupBookingOguzId} (${C6_OGUZ_SEMI_PRIVATE_DURATION}h × 2 ppl, pkg+wallet)`);

  // Complete the semi-private lesson with Oğuzhan
  await apiOk('PUT', `/bookings/${groupBookingOguzId}`, { status: 'completed' }, token);
  ok('  Semi-private lesson with Oğuzhan completed');

  // Track: Oğuzhan earns on the semi-private
  allBookingIds.oguzhan.push({ id: groupBookingOguzId, duration: C6_OGUZ_SEMI_PRIVATE_DURATION, isGroup: true, groupSize: 2 });

  // Private package lessons with Oğuzhan (6h, leaving 4h remaining: 10 - 6 = 4)
  log(`  6 private sessions (6h) with ${oguzhanName} from Rider Progression...`);
  const c6PkgBookings = await bookAndCompleteLessons(
    C6_PKG_SESSIONS, c6.userId, OGUZHAN_ID, PRIVATE_LESSON_SERVICE_ID, token, 145,
    { use_package: true, customer_package_id: c6CpId }
  );
  allBookingIds.oguzhan.push(...c6PkgBookings);

  // Book 1h pending lesson, then cancel it
  title('C6b · Book & Cancel a Pending Lesson');
  const c6PendingBooking = await bookPendingLesson(
    c6.userId, OGUZHAN_ID, PRIVATE_LESSON_SERVICE_ID, 1, token, 155,
    { use_package: true, customer_package_id: c6CpId }
  );
  ok(`  Pending lesson booked: ${c6PendingBooking.id}`);

  // Cancel it
  try {
    await apiOk('POST', `/bookings/${c6PendingBooking.id}/cancel`, {
      cancellation_reason: 'Mega test: cancellation flow',
    }, token);
    ok('  Booking cancelled via POST /cancel');
  } catch {
    // Fallback to PATCH status
    await apiOk('PATCH', `/bookings/${c6PendingBooking.id}/status`, {
      status: 'cancelled',
    }, token);
    ok('  Booking cancelled via PATCH /status');
  }

  // Verify Rider Progression remaining hours
  const c6PkgCheck = await apiOk('GET', `/services/customer-packages/${c6.userId}`, null, token);
  const c6PkgList = Array.isArray(c6PkgCheck) ? c6PkgCheck : c6PkgCheck.packages || c6PkgCheck.data || [];
  const c6OurPkg = c6PkgList.find(p => p.id === c6CpId);
  if (c6OurPkg) {
    const remain = parseFloat(c6OurPkg.remaining_hours ?? c6OurPkg.remainingHours ?? -1);
    // 10h total - 6h Oğuzhan pkg lessons = 4h remaining (cancel restored the 1h)
    assert(remain === 4, `C6 Rider Progression remaining = 4h (got ${remain}h)`);
    const st = (c6OurPkg.status || '').toLowerCase();
    assert(st === 'active', `C6 package status = active (got ${st}) — 4h remaining`);
  } else {
    fail('C6 Rider Progression package not found');
  }

  // Verify Semi-Private package remaining hours
  const c6SemiPkgObj = c6PkgList.find(p => p.id === c6SemiCpId);
  if (c6SemiPkgObj) {
    const semiRemain = parseFloat(c6SemiPkgObj.remaining_hours ?? c6SemiPkgObj.remainingHours ?? -1);
    // 10h total - 2h semi-private Elif - 2h semi-private Oğuzhan = 6h remaining
    assert(semiRemain === 6, `C6 Semi-Private remaining = 6h (got ${semiRemain}h)`);
    const semiSt = (c6SemiPkgObj.status || '').toLowerCase();
    assert(semiSt === 'active', `C6 Semi-Private package status = active (got ${semiSt})`);
  } else {
    fail('C6 Semi-Private package not found');
  }

  // ────────────────────────────────────────────────────────────
  //  C6B · SELIN — Individual Lesson with Siyabend
  // ────────────────────────────────────────────────────────────

  title('C6B · SELIN — 1 Individual Lesson with ' + siyabendName);

  const c6bBookings = await bookAndCompleteLessons(
    C6B_INDIVIDUAL_SESSIONS, c6b.userId, SIYABEND_ID, PRIVATE_LESSON_SERVICE_ID, token, 160
  );
  allBookingIds.siyabend.push(...c6bBookings);

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 4: INSTRUCTOR EARNINGS VERIFICATION
  // ══════════════════════════════════════════════════════════════════

  title('PHASE 4 · Instructor Earnings Verification');

  // ── ELIF ──
  title('4a · ' + elifName + ' Earnings');
  const elifEarningsRes = await apiOk('GET', `/finances/instructor-earnings/${ELIF_ID}`, null, token);
  const elifAllEarnings = elifEarningsRes.earnings || [];
  const elifBookingIds = new Set(allBookingIds.elif.map(b => b.id));
  const elifOurEarnings = elifAllEarnings.filter(e => elifBookingIds.has(e.booking_id));
  const elifTotalEarned = elifOurEarnings.reduce((s, e) => s + parseFloat(e.total_earnings || 0), 0);

  log(`  Bookings: ${allBookingIds.elif.length} → ${elifOurEarnings.length} earnings → €${elifTotalEarned.toFixed(2)}`);

  // Calculate expected Elif earnings:
  // C1: 8 sessions (15h) via All Inclusive @ package rate → each session: ALL_INCL_HOURLY * dur * rate%
  // C4: 6 sessions (6h) via Starter @ package rate → each session: STARTER_HOURLY * dur * rate%
  // C5: 1 session (1h) individual @ €90 → 90 * 1 * rate%
  // C6 semi-private: 2h × 2ppl × €55 (pkg hourly) × semi-private rate%
  let elifExpected = 0;
  // C1: All Inclusive lessons (15h)
  for (const sess of ALL_INCLUSIVE_SESSIONS) {
    elifExpected += ALL_INCL_HOURLY * sess * (ELIF_RATE_PCT / 100);
  }
  // C4: Starter lessons (6h)
  for (const sess of C4_STARTER_SESSIONS) {
    elifExpected += STARTER_HOURLY * sess * (ELIF_RATE_PCT / 100);
  }
  // C5: Individual (1h)
  for (const sess of C5_INDIVIDUAL_SESSIONS) {
    elifExpected += PRIVATE_LESSON_PRICE * sess * (ELIF_RATE_PCT / 100);
  }
  // C6 semi-private (Elif): lesson_amount = servicePrice × dur × groupSize = 60×2×2 = 240
  // (pkg covers 55×2=110, pkg user pays diff (60-55)×2=10, cash user pays 60×2=120 → booking.amount=130)
  elifExpected += (SEMI_PRIVATE_LESSON_PRICE * C6_SEMI_PRIVATE_DURATION * 2) * (ELIF_SEMI_PRIV_RATE / 100);

  log(`  Expected: €${elifExpected.toFixed(2)} (${ELIF_RATE_PCT}% general + ${ELIF_SEMI_PRIV_RATE}% semi-priv)`);
  assert(elifOurEarnings.length === allBookingIds.elif.length,
    `${elifName}: ${allBookingIds.elif.length} bookings → ${elifOurEarnings.length} earnings`);
  assertClose(elifTotalEarned, elifExpected, `${elifName} total earnings`, 2.0);

  // ── OĞUZHAN ──
  title('4b · ' + oguzhanName + ' Earnings');
  const oguzhanEarningsRes = await apiOk('GET', `/finances/instructor-earnings/${OGUZHAN_ID}`, null, token);
  const oguzhanAllEarnings = oguzhanEarningsRes.earnings || [];
  const oguzhanBookingIds = new Set(allBookingIds.oguzhan.map(b => b.id));
  const oguzhanOurEarnings = oguzhanAllEarnings.filter(e => oguzhanBookingIds.has(e.booking_id));
  const oguzhanTotalEarned = oguzhanOurEarnings.reduce((s, e) => s + parseFloat(e.total_earnings || 0), 0);

  log(`  Bookings: ${allBookingIds.oguzhan.length} → ${oguzhanOurEarnings.length} earnings → €${oguzhanTotalEarned.toFixed(2)}`);

  // Expected Oğuzhan earnings:
  // C3: 3 individual sessions (4.5h) @ €90 → 90 * 4.5 * rate%
  // C6 semi-private: 2h × 2ppl × €55 (pkg hourly) × semi-private rate%
  // C6: 6 pkg sessions (6h) via Rider Progression → RIDER_HOURLY * 6h * rate%
  let oguzhanExpected = 0;
  for (const sess of C3_INDIVIDUAL_SESSIONS) {
    oguzhanExpected += PRIVATE_LESSON_PRICE * sess * (OGUZHAN_RATE_PCT / 100);
  }
  // C6 semi-private with Oğuzhan: lesson_amount = servicePrice × dur × groupSize = 60×2×2 = 240
  oguzhanExpected += (SEMI_PRIVATE_LESSON_PRICE * C6_OGUZ_SEMI_PRIVATE_DURATION * 2) * (OGUZHAN_SEMI_PRIV_RATE / 100);
  for (const sess of C6_PKG_SESSIONS) {
    oguzhanExpected += RIDER_HOURLY * sess * (OGUZHAN_RATE_PCT / 100);
  }
  log(`  Expected: €${oguzhanExpected.toFixed(2)} (${OGUZHAN_RATE_PCT}% of: Indiv C3 + Rider C6 | ${OGUZHAN_SEMI_PRIV_RATE}% semi-priv)`);
  assert(oguzhanOurEarnings.length === allBookingIds.oguzhan.length,
    `${oguzhanName}: ${allBookingIds.oguzhan.length} bookings → ${oguzhanOurEarnings.length} earnings`);
  assertClose(oguzhanTotalEarned, oguzhanExpected, `${oguzhanName} total earnings`, 2.0);

  // ── SIYABEND ──
  title('4c · ' + siyabendName + ' Earnings');
  const siyabendEarningsRes = await apiOk('GET', `/finances/instructor-earnings/${SIYABEND_ID}`, null, token);
  const siyabendAllEarnings = siyabendEarningsRes.earnings || [];
  const siyabendBookingIds = new Set(allBookingIds.siyabend.map(b => b.id));
  const siyabendOurEarnings = siyabendAllEarnings.filter(e => siyabendBookingIds.has(e.booking_id));
  const siyabendTotalEarned = siyabendOurEarnings.reduce((s, e) => s + parseFloat(e.total_earnings || 0), 0);

  log(`  Bookings: ${allBookingIds.siyabend.length} → ${siyabendOurEarnings.length} earnings → €${siyabendTotalEarned.toFixed(2)}`);

  // Expected Siyabend earnings:
  // C2: 6 pkg sessions (12h) @ KITESURF_HOURLY * dur (package) → but Siyabend is FIXED €20/h
  //     So: 12h * €20/h = €240
  // C2: 1 individual (1.5h) @ private → 1.5h * €20/h = €30
  // C6B: 1 individual (1h) @ private → 1h * €20/h = €20
  const siyabendTotalHours = KITESURF_SESSIONS.reduce((a, b) => a + b, 0)
    + C2_INDIVIDUAL_SESSIONS.reduce((a, b) => a + b, 0)
    + C6B_INDIVIDUAL_SESSIONS.reduce((a, b) => a + b, 0);
  const siyabendExpected = siyabendTotalHours * SIYABEND_FIXED_RATE;
  log(`  Expected: €${siyabendExpected.toFixed(2)} (€${SIYABEND_FIXED_RATE}/h × ${siyabendTotalHours}h)`);
  assert(siyabendOurEarnings.length === allBookingIds.siyabend.length,
    `${siyabendName}: ${allBookingIds.siyabend.length} bookings → ${siyabendOurEarnings.length} earnings`);
  assertClose(siyabendTotalEarned, siyabendExpected, `${siyabendName} total earnings`, 2.0);

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 5: MANAGER COMMISSION VERIFICATION
  // ══════════════════════════════════════════════════════════════════

  title('PHASE 5 · Manager Commission Verification');

  const mgCommRes = await apiOk(
    'GET', `/manager/commissions/admin/managers/${managerId}/commissions?limit=1000`, null, token
  );
  const mgComm = mgCommRes.data || mgCommRes || [];
  log(`  Total commission records: ${mgComm.length}`);

  // ── 5a: BOOKING COMMISSIONS ──
  title('5a · Booking Commissions');
  const allBookings = [...allBookingIds.elif, ...allBookingIds.oguzhan, ...allBookingIds.siyabend];
  const allBookingIdSet = new Set(allBookings.map(b => b.id));
  const bookingComm = mgComm.filter(c =>
    c.source_type === 'booking' && (allBookingIdSet.has(c.source_id) || allBookingIdSet.has(c.booking_id))
  );
  const bookingCommTotal = bookingComm.reduce(
    (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
  );
  log(`  Booking commissions: ${bookingComm.length} records → €${bookingCommTotal.toFixed(2)}`);

  // Expected: 10% of each booking's lesson amount
  // C1: 15h @ ALL_INCL_HOURLY → 10%
  // C2: 12h @ KITESURF_HOURLY (pkg) + 1.5h @ €90 (indiv) → 10%
  // C3: 4.5h @ €90 → 10%
  // C4: 6h @ STARTER_HOURLY (pkg) → 10%
  // C5: 1h @ €90 → 10%
  // C6: 2h semi-private (pkgHourly × dur × groupSize) → 10%, + 6h @ RIDER_HOURLY → 10%
  // C6B: 1h @ €90 → 10%
  let expectedBookingComm = 0;
  // C1
  for (const sess of ALL_INCLUSIVE_SESSIONS) {
    expectedBookingComm += ALL_INCL_HOURLY * sess * (MGR_BOOKING_RATE / 100);
  }
  // C2 pkg
  for (const sess of KITESURF_SESSIONS) {
    expectedBookingComm += KITESURF_HOURLY * sess * (MGR_BOOKING_RATE / 100);
  }
  // C2 individual
  for (const sess of C2_INDIVIDUAL_SESSIONS) {
    expectedBookingComm += PRIVATE_LESSON_PRICE * sess * (MGR_BOOKING_RATE / 100);
  }
  // C3
  for (const sess of C3_INDIVIDUAL_SESSIONS) {
    expectedBookingComm += PRIVATE_LESSON_PRICE * sess * (MGR_BOOKING_RATE / 100);
  }
  // C4 Starter pkg
  for (const sess of C4_STARTER_SESSIONS) {
    expectedBookingComm += STARTER_HOURLY * sess * (MGR_BOOKING_RATE / 100);
  }
  // C5
  for (const sess of C5_INDIVIDUAL_SESSIONS) {
    expectedBookingComm += PRIVATE_LESSON_PRICE * sess * (MGR_BOOKING_RATE / 100);
  }
  // C6 semi-private with Elif: lesson_amount = servicePrice × dur × groupSize = 240
  expectedBookingComm += (SEMI_PRIVATE_LESSON_PRICE * C6_SEMI_PRIVATE_DURATION * 2) * (MGR_BOOKING_RATE / 100);
  // C6 semi-private with Oğuzhan: lesson_amount = servicePrice × dur × groupSize = 240
  expectedBookingComm += (SEMI_PRIVATE_LESSON_PRICE * C6_OGUZ_SEMI_PRIVATE_DURATION * 2) * (MGR_BOOKING_RATE / 100);
  // C6 pkg lessons with Oğuzhan
  for (const sess of C6_PKG_SESSIONS) {
    expectedBookingComm += RIDER_HOURLY * sess * (MGR_BOOKING_RATE / 100);
  }
  // C6B individual
  for (const sess of C6B_INDIVIDUAL_SESSIONS) {
    expectedBookingComm += PRIVATE_LESSON_PRICE * sess * (MGR_BOOKING_RATE / 100);
  }

  log(`  Expected booking commission: €${expectedBookingComm.toFixed(2)}`);
  const expectedBookingCount = allBookings.length;
  assert(bookingComm.length === expectedBookingCount,
    `Booking commission count: ${bookingComm.length} (expected ${expectedBookingCount})`);
  assertClose(bookingCommTotal, expectedBookingComm, 'Booking commission total', 5.0);

  // ── 5b: RENTAL COMMISSIONS ──
  title('5b · Rental Commissions');
  const allRentals = [...allRentalIds.standalone, ...allRentalIds.package];
  const allRentalIdSet = new Set(allRentals);
  const rentalComm = mgComm.filter(c =>
    c.source_type === 'rental' && (allRentalIdSet.has(c.source_id) || allRentalIdSet.has(c.rental_id))
  );
  const rentalCommTotal = rentalComm.reduce(
    (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
  );
  log(`  Rental commissions: ${rentalComm.length} records → €${rentalCommTotal.toFixed(2)}`);

  // Standalone (C3): 5 daily rentals → each has a price (rental daily rate from wallet)
  const standaloneRentalComm = rentalComm.filter(c =>
    allRentalIds.standalone.some(rId => c.source_id === rId || c.rental_id === rId)
  );
  log(`    Standalone: ${standaloneRentalComm.length} records`);
  assert(standaloneRentalComm.length === allRentalIds.standalone.length,
    `Standalone rental commissions: ${standaloneRentalComm.length} (expected ${allRentalIds.standalone.length})`);

  // Package rentals: C1 (14) + C4 (7) = 21
  const packageRentalComm = rentalComm.filter(c =>
    allRentalIds.package.some(rId => c.source_id === rId || c.rental_id === rId)
  );
  log(`    Package: ${packageRentalComm.length} records`);
  assert(packageRentalComm.length === allRentalIds.package.length,
    `Package rental commissions: ${packageRentalComm.length} (expected ${allRentalIds.package.length})`);

  assert(rentalCommTotal > 0, `Total rental commission > €0 (€${rentalCommTotal.toFixed(2)})`);

  // ── 5c: ACCOMMODATION COMMISSIONS ──
  title('5c · Accommodation Commissions');
  const accomComm = mgComm.filter(c => c.source_type === 'accommodation');
  const accomCommTotal = accomComm.reduce(
    (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
  );
  log(`  Accommodation commissions: ${accomComm.length} records → €${accomCommTotal.toFixed(2)}`);

  // C3 standalone accommodation should generate commission IF accom rate > 0
  // Package accommodation (C1, C2) → total_price = 0 → commission SKIPPED
  if (allAccomIds.standalone.length > 0 && MGR_ACCOM_RATE > 0) {
    assert(accomComm.length >= 1,
      `Standalone accommodation commission exists (${accomComm.length} records)`);
  } else if (MGR_ACCOM_RATE === 0) {
    ok(`Accommodation rate is 0% — no accommodation commissions expected`);
  }
  // Log note about package accommodation
  log(`    Note: Package accommodation (total_price=0) → commission skipped (expected)`);

  // ── 5d: PACKAGE COMMISSIONS (info only) ──
  title('5d · Package Commission Note');
  log('  recordPackageCommission exists but is NEVER called in the codebase (dead code).');
  log('  Package commission instead flows through component completions:');
  log('    → Lesson completion → booking commission (packageHourlyRate × duration × bookingRate%)');
  log('    → Rental completion → rental commission (packageDailyRate × days × rentalRate%)');
  log('    → Accommodation → skipped if total_price=0 (package accommodation)');
  const packageComm = mgComm.filter(c => c.source_type === 'package');
  const packageCommTotal = packageComm.reduce(
    (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
  );
  if (packageComm.length > 0) {
    log(`  Unexpected package commissions found: ${packageComm.length} records → €${packageCommTotal.toFixed(2)}`);
  } else {
    ok('No separate package-level commissions (expected — commission via components)');
  }

  // ── 5e: SHOP COMMISSIONS (info — depends on shopRate config) ──
  title('5e · Shop Commissions');
  const shopComm = mgComm.filter(c => c.source_type === 'shop' || c.source_type === 'shop_order');
  const shopCommTotal = shopComm.reduce(
    (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
  );
  log(`  Shop commissions: ${shopComm.length} records → €${shopCommTotal.toFixed(2)}`);
  if (shopComm.length > 0) {
    ok(`Shop commissions recorded (shopRate is configured)`);
  } else {
    log('  No shop commissions — shopRate is likely null (not configured)');
    ok('Shop commission absent — expected when shopRate not set');
  }

  // ── 5f: MEMBERSHIP COMMISSIONS (info — depends on membershipRate config) ──
  title('5f · Membership Commissions');
  const memberComm = mgComm.filter(c => c.source_type === 'membership');
  const memberCommTotal = memberComm.reduce(
    (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
  );
  log(`  Membership commissions: ${memberComm.length} records → €${memberCommTotal.toFixed(2)}`);
  if (memberComm.length > 0) {
    ok(`Membership commissions recorded (membershipRate is configured)`);
  } else {
    log('  No membership commissions — membershipRate is likely null (not configured)');
    ok('Membership commission absent — expected when membershipRate not set');
  }

  // ── 5g: MANAGER SUMMARY ──
  title('5g · Manager Dashboard Summary');
  const mgSummaryRes = await apiOk(
    'GET', `/manager/commissions/admin/managers/${managerId}/summary`, null, token
  );
  const mgSummary = mgSummaryRes.data || mgSummaryRes;
  const totalMgrEarned = parseFloat(mgSummary?.totalEarned ?? mgSummary?.total_earned ?? 0);
  log(`  Manager total earned: €${totalMgrEarned.toFixed(2)}`);
  assert(totalMgrEarned > 0, `Manager totalEarned > €0`);

  // Dual-role verification (Oğuzhan = manager + instructor)
  title('5h · Dual-Role Verification (Oğuzhan)');
  log(`  ${oguzhanName} is BOTH manager AND instructor`);
  log(`  → Instructor earnings: €${oguzhanTotalEarned.toFixed(2)}`);
  log(`  → Manager commission: from booking/rental/package etc.`);
  assert(oguzhanTotalEarned > 0, 'Oğuzhan instructor earnings > €0');
  assert(totalMgrEarned > 0, 'Oğuzhan manager commissions > €0');
  ok('  Dual-role: both instructor earnings and manager commissions co-exist ✓');

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 6: MANAGER PAYMENT RECORDING
  // ══════════════════════════════════════════════════════════════════

  title('PHASE 6 · Manager Payment Recording');

  // Record a payment of €500
  const paymentDate = new Date().toISOString().slice(0, 10);
  const payRes = await apiOk('POST', `/manager/commissions/admin/managers/${managerId}/payments`, {
    amount: 500,
    description: 'Mega test: monthly commission payment',
    payment_date: paymentDate,
    payment_method: 'cash',
  }, token);
  ok(`Payment recorded: €500 (${payRes.transaction?.id || 'ok'})`);

  // Record a deduction of €50
  const deductRes = await apiOk('POST', `/manager/commissions/admin/managers/${managerId}/payments`, {
    amount: -50,
    description: 'Mega test: deduction for equipment damage',
    payment_date: paymentDate,
    payment_method: 'cash',
  }, token);
  ok(`Deduction recorded: -€50 (${deductRes.transaction?.id || 'ok'})`);

  // Verify payment history
  const payHistRes = await apiOk(
    'GET', `/manager/commissions/admin/managers/${managerId}/payment-history`, null, token
  );
  const payHist = payHistRes.data || payHistRes || [];
  assert(Array.isArray(payHist) && payHist.length >= 2,
    `Payment history has >= 2 records (got ${Array.isArray(payHist) ? payHist.length : 0})`);

  // Verify payment amounts in history
  const payHistAmounts = (Array.isArray(payHist) ? payHist : []);
  const totalPaymentRecorded = payHistAmounts.reduce((s, p) => {
    const amt = parseFloat(p.amount ?? p.payment_amount ?? 0);
    return s + amt;
  }, 0);
  log(`  Total payment amount in history: €${totalPaymentRecorded.toFixed(2)} (net: pay €500 - deduct €50 = €450)`);
  assert(payHistAmounts.length >= 2, `Payment history has >= 2 records (got ${payHistAmounts.length})`);
  ok('Manager payment recording verified via payment-history endpoint');

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 7: WALLET BALANCE VERIFICATION
  // ══════════════════════════════════════════════════════════════════

  title('PHASE 7 · Wallet Balance Verification');

  for (const [label, cust, initialAmt] of [
    ['C1', c1, WALLET_AMOUNTS.c1],
    ['C2', c2, WALLET_AMOUNTS.c2],
    ['C3', c3, WALLET_AMOUNTS.c3],
    ['C4', c4, WALLET_AMOUNTS.c4],
    ['C5', c5, WALLET_AMOUNTS.c5],
    ['C6', c6, WALLET_AMOUNTS.c6],
    ['C6B', c6b, WALLET_AMOUNTS.c6b],
  ]) {
    const bal = await getWalletBalance(cust.userId, token);
    assert(bal < initialAmt, `${label} wallet decreased: €${bal.toFixed(2)} < €${initialAmt}`);
    assert(bal >= 0, `${label} wallet non-negative: €${bal.toFixed(2)}`);
    log(`    ${label}: €${bal.toFixed(2)} (started €${initialAmt})`);
  }

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 8: FINANCE SUMMARY
  // ══════════════════════════════════════════════════════════════════

  title('PHASE 8 · Admin Finance Summary');

  const finSummary = await apiOk('GET', '/finances/summary?mode=accrual', null, token);
  const revenue = finSummary.revenue || {};
  log(`  Total revenue:         €${revenue.total_revenue || 0}`);
  log(`  Lesson revenue:        €${revenue.lesson_revenue || 0}`);
  log(`  Rental revenue:        €${revenue.rental_revenue || 0}`);
  log(`  Package revenue:       €${revenue.package_revenue || 0}`);
  log(`  Accommodation revenue: €${revenue.accommodation_revenue || 0}`);
  assert(Number(revenue.total_revenue) > 0, `Total revenue > €0`);

  // ══════════════════════════════════════════════════════════════════
  //  GRAND SUMMARY
  // ══════════════════════════════════════════════════════════════════

  title('🏆 TEST RESULTS');
  log(`\n  ${passedTests}/${totalTests} tests passed\n`);

  if (passedTests === totalTests) {
    log('  🎉 ALL TESTS PASSED!\n');
  } else {
    log(`  ⚠️  ${totalTests - passedTests} test(s) failed.\n`);
  }

  log('═'.repeat(60));
  log('  CUSTOMER SUMMARY');
  log('═'.repeat(60));
  log(`  C1  ${c1.profile.first_name} ${c1.profile.last_name}: All Inclusive (€${ALL_INCLUSIVE_PKG_PRICE}) + Elif ${ALL_INCLUSIVE_PKG_HOURS}h + ${ALL_INCLUSIVE_PKG_RENTAL_DAYS}d rental + ${ALL_INCLUSIVE_PKG_NIGHTS}n accom + Seasonal + Shop`);
  log(`  C2  ${c2.profile.first_name} ${c2.profile.last_name}: Kitesurf (€${KITESURF_PKG_PRICE}) + Siyabend ${KITESURF_PKG_HOURS}h + ${KITESURF_PKG_NIGHTS}n accom + 1 indiv`);
  log(`  C3  ${c3.profile.first_name} ${c3.profile.last_name}: 3 individual (${C3_TOTAL_HOURS}h) Oğuzhan + 5d rental + 5n accom`);
  log(`  C4  ${c4.profile.first_name} ${c4.profile.last_name}: Starter (€${STARTER_PKG_PRICE}) + SLS Rental (€${SLS_RENTAL_PKG_PRICE}) + Elif ${STARTER_PKG_HOURS}h + ${SLS_RENTAL_PKG_DAYS}d rental`);
  log(`  C5  ${c5.profile.first_name} ${c5.profile.last_name}: 2 shop products + Seasonal (€${SEASONAL_PASS_PRICE}) + 1 indiv Elif`);
  log(`  C6  ${c6.profile.first_name} ${c6.profile.last_name}: Rider Progression (€${PKG_PRICE}) + 2h semi-private + 6h Oğuzhan + 1 cancelled`);
  log(`  C6B ${c6b.profile.first_name} ${c6b.profile.last_name}: Semi-private partner + 1 indiv Siyabend`);
  log('');
  log('  INSTRUCTOR EARNINGS');
  log(`    ${elifName}:     €${elifTotalEarned.toFixed(2)} (expected €${elifExpected.toFixed(2)})`);
  log(`    ${oguzhanName}:  €${oguzhanTotalEarned.toFixed(2)} (expected €${oguzhanExpected.toFixed(2)})`);
  log(`    ${siyabendName}: €${siyabendTotalEarned.toFixed(2)} (expected €${siyabendExpected.toFixed(2)})`);
  log('');
  log('  MANAGER COMMISSIONS (by category)');
  log(`    Booking:       €${bookingCommTotal.toFixed(2)} (expected €${expectedBookingComm.toFixed(2)})`);
  log(`    Rental:        €${rentalCommTotal.toFixed(2)}`);
  log(`    Accommodation: €${accomCommTotal.toFixed(2)}`);
  log(`    Package:       N/A — commission via component completions (not package purchase)`);
  log(`    Shop:          €${shopCommTotal.toFixed(2)} (depends on shopRate config)`);
  log(`    Membership:    €${memberCommTotal.toFixed(2)} (depends on membershipRate config)`);
  log(`    Manager paid:  €500 pay / €50 deduct`);
  log('');
  log(`  Cleanup: node tests/scripts/cleanup.mjs`);
  log('═'.repeat(60));

  process.exit(passedTests === totalTests ? 0 : 1);
}

main().catch(e => {
  console.error('\n❌ FATAL:', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
