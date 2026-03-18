#!/usr/bin/env node
/**
 * Instructor & Manager Commission Accuracy Test
 *
 * Verifies that instructor earnings and manager commissions are computed
 * correctly (exact EUR amounts) across every combination of:
 *   - Percentage commission (Elif 30%, Oğuzhan 30%)
 *   - Fixed per-hour / category-based commission (Siyabend €20/h private)
 *   - All-inclusive package with stored hourly rate (€65/h)
 *   - Lesson-only package (€470 / 6h = €78.33/h — subtraction fallback)
 *   - Individual (non-package) standalone lessons
 *   - Manager-as-instructor dual-role (Oğuzhan)
 *
 * Scenarios:
 *   S1: C1 → Elif (30%)      → Beginner Pkg (hourly €65)  → 3×2h
 *   S2: C2 → Oğuzhan (30%)   → Starter Pkg (€470/6h)      → 3×2h
 *   S3: C3 → Oğuzhan (30%)   → Individual (€90/h)          → 2×2h
 *   S4: C4 → Siyabend (€20/h)→ Starter Pkg (€470/6h)      → 3×2h
 *   S5: C4 → Siyabend (€20/h)→ Individual (€90/h)          → 2×1h
 *
 * Usage:   node tests/scripts/testflows/InstructorManagerCommissionTest.mjs
 * Cleanup: node tests/scripts/cleanup.mjs
 */

import {
  API, PASSWORD, ADMIN_EMAIL,
  PROFILES, TURKISH_PROFILES,
  STARTER_PKG_ID, STARTER_PKG_NAME, STARTER_PKG_PRICE, STARTER_PKG_HOURS,
  PRIVATE_LESSON_SERVICE_ID, PRIVATE_LESSON_PRICE,
  ELIF_ID, OGUZHAN_ID, SIYABEND_ID,
  log, ok, fail, title,
  api, apiOk, shuffle, adminLogin,
} from '../_shared.mjs';

// Manager commission rate for bookings (from DB: per_category, booking_rate=10%)
const MGR_BOOKING_RATE = 10;

// ── Expected values (pre-computed from known rates) ────────────────
// S1: Elif 30%, Beginner Pkg hourly_rate=€65, 2h session → lesson = €130
const S1_LESSON_AMOUNT      = 130.00;
const S1_INSTRUCTOR_EARNING = 39.00;   // 30% × 130
const S1_MGR_COMMISSION     = 13.00;   // 10% × 130

// S2: Oğuzhan 30%, Starter Pkg €470/6h, 2h session → lesson = 470/6*2 = 156.67
const S2_LESSON_AMOUNT      = 156.67;
const S2_INSTRUCTOR_EARNING = 47.00;   // 30% × 156.67 = 47.001
const S2_MGR_COMMISSION     = 15.67;   // 10% × 156.67

// S3: Oğuzhan 30%, Individual €90/h, 2h session → lesson = €180
const S3_LESSON_AMOUNT      = 180.00;
const S3_INSTRUCTOR_EARNING = 54.00;   // 30% × 180
const S3_MGR_COMMISSION     = 18.00;   // 10% × 180

// S4: Siyabend €20/h (private category), Starter Pkg → lesson = €156.67
const S4_LESSON_AMOUNT      = 156.67;
const S4_INSTRUCTOR_EARNING = 40.00;   // €20/h × 2h
const S4_MGR_COMMISSION     = 15.67;   // 10% × 156.67

// S5: Siyabend €20/h (private category), Individual €90/h, 1h → lesson = €90
const S5_LESSON_AMOUNT      = 90.00;
const S5_INSTRUCTOR_EARNING = 20.00;   // €20/h × 1h
const S5_MGR_COMMISSION     = 9.00;    // 10% × 90

// ── Date helpers ───────────────────────────────────────────────────
const DATE_BASE_OFFSET = 100 + Math.floor(Math.random() * 180);
function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + DATE_BASE_OFFSET + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// ── Test framework ─────────────────────────────────────────────────
let totalTests = 0, passedTests = 0;
const warn = (msg) => log(`  ⚠️  ${msg}`);

function assert(condition, label) {
  totalTests++;
  if (condition) { passedTests++; ok(label); }
  else { fail(label); }
}

function assertClose(actual, expected, label, tolerance = 0.02) {
  const diff = Math.abs(actual - expected);
  totalTests++;
  if (diff <= tolerance) {
    passedTests++;
    ok(`${label}: €${actual.toFixed(2)} (expected €${expected.toFixed(2)})`);
  } else {
    fail(`${label}: €${actual.toFixed(2)} (expected €${expected.toFixed(2)}, diff €${diff.toFixed(2)})`);
  }
}

// ── Helpers ────────────────────────────────────────────────────────
async function createCustomer(profiles, roleId, token) {
  const shuffled = shuffle(profiles);
  for (const p of shuffled) {
    const res = await api('POST', '/users', { ...p, password: PASSWORD, role_id: roleId }, token);
    if (res.ok) {
      const userId = res.data.id || res.data.user?.id;
      return { userId, profile: p };
    }
    if (res.status !== 409) throw new Error(`POST /users → ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
  }
  throw new Error('All customer profiles already exist');
}

async function fundWallet(userId, amount, token) {
  await apiOk('POST', '/wallet/manual-adjust', {
    userId, amount, currency: 'EUR',
    reason: 'Test funding for commission test',
  }, token);
}

async function getWalletBalance(userId, token) {
  const res = await apiOk('GET', `/wallet/balance/${userId}`, null, token);
  return parseFloat(res.balances?.EUR ?? res.balance ?? res.available ?? 0);
}

/**
 * Book lessons for given sessions, then complete them all.
 * Returns array of { id, duration }.
 */
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
  title('INSTRUCTOR & MANAGER COMMISSION ACCURACY TEST');

  // ════════════════════════════════════════════════════════════════════
  //  1 · Admin Login & Lookup Beginner Package
  // ════════════════════════════════════════════════════════════════════
  title('1 · Admin Login');
  const token = await adminLogin();
  ok('Logged in as admin');

  // Look up All Inclusive Beginner Package dynamically
  title('1b · Looking up All Inclusive Beginner Package');
  const pkgsRes = await apiOk('GET', '/services/packages', null, token);
  const allPkgs = Array.isArray(pkgsRes) ? pkgsRes : pkgsRes.packages || pkgsRes.data || [];
  const beginnerPkg = allPkgs.find(p =>
    (p.name || '').toLowerCase().includes('beginner') &&
    (p.packageType === 'all_inclusive' || p.includesAccommodation)
  );
  if (!beginnerPkg) throw new Error('All Inclusive Beginner Package not found');

  const BEG_PKG_ID    = beginnerPkg.id;
  const BEG_PKG_NAME  = beginnerPkg.name;
  const BEG_PKG_PRICE = parseFloat(beginnerPkg.price);
  const BEG_PKG_HOURS = parseFloat(beginnerPkg.totalHours || 0);
  const BEG_LESSON_SVC = beginnerPkg.lessonServiceId;
  const BEG_HOURLY    = parseFloat(beginnerPkg.packageHourlyRate || 0);
  const BEG_RENTAL_DAYS = parseInt(beginnerPkg.rentalDays || 0);
  const BEG_NIGHTS     = parseInt(beginnerPkg.accommodationNights || 0);
  const BEG_ACCOM_UNIT = beginnerPkg.accommodationUnitId || null;
  const BEG_RENTAL_SVC = beginnerPkg.rentalServiceId || null;

  log(`  ${BEG_PKG_NAME}: €${BEG_PKG_PRICE}, ${BEG_PKG_HOURS}h, hourly=€${BEG_HOURLY}`);
  log(`  Lesson service: ${BEG_LESSON_SVC}`);
  assert(BEG_HOURLY === 65, `Beginner pkg hourly rate = €65 (got €${BEG_HOURLY})`);

  // ════════════════════════════════════════════════════════════════════
  //  2 · Verify Instructors & Commission Rates
  // ════════════════════════════════════════════════════════════════════
  title('2 · Verifying Instructors');
  const instructorList = await apiOk('GET', '/instructors', null, token);
  const allInstructors = Array.isArray(instructorList) ? instructorList : instructorList.instructors || [];

  const elif     = allInstructors.find(i => i.id === ELIF_ID);
  const oguzhan  = allInstructors.find(i => i.id === OGUZHAN_ID);
  const siyabend = allInstructors.find(i => i.id === SIYABEND_ID);
  if (!elif)     throw new Error('Elif Sarı not found in instructors');
  if (!oguzhan)  throw new Error('Oğuzhan Bentürk not found in instructors');
  if (!siyabend) throw new Error('Siyabend Şanlı not found in instructors');

  const elifName     = `${elif.first_name} ${elif.last_name}`;
  const oguzhanName  = `${oguzhan.first_name} ${oguzhan.last_name}`;
  const siyabendName = `${siyabend.first_name} ${siyabend.last_name}`;
  ok(`Instructors: ${elifName}, ${oguzhanName}, ${siyabendName}`);

  // Verify commission configs
  title('2b · Verifying Commission Rates');

  const elifComm = await apiOk('GET', `/instructor-commissions/instructors/${ELIF_ID}/commissions`, null, token);
  const elifDefault = elifComm.defaultCommission || elifComm.default || {};
  log(`  ${elifName}: ${elifDefault.type || elifDefault.commissionType} ${elifDefault.value || elifDefault.commissionValue}`);
  assert(
    (elifDefault.type || elifDefault.commissionType) === 'percentage' &&
    parseFloat(elifDefault.value || elifDefault.commissionValue) === 30,
    `${elifName}: percentage 30%`
  );

  const oguzComm = await apiOk('GET', `/instructor-commissions/instructors/${OGUZHAN_ID}/commissions`, null, token);
  const oguzDefault = oguzComm.defaultCommission || oguzComm.default || {};
  log(`  ${oguzhanName}: ${oguzDefault.type || oguzDefault.commissionType} ${oguzDefault.value || oguzDefault.commissionValue}`);
  assert(
    (oguzDefault.type || oguzDefault.commissionType) === 'percentage' &&
    parseFloat(oguzDefault.value || oguzDefault.commissionValue) === 30,
    `${oguzhanName}: percentage 30%`
  );

  const siyComm = await apiOk('GET', `/instructor-commissions/instructors/${SIYABEND_ID}/commissions`, null, token);
  const siyDefault = siyComm.defaultCommission || siyComm.default || {};
  log(`  ${siyabendName} default: ${siyDefault.type || siyDefault.commissionType} ${siyDefault.value || siyDefault.commissionValue}`);

  // Verify Siyabend's category rates
  const siyCatRes = await apiOk('GET', `/instructor-commissions/instructors/${SIYABEND_ID}/category-rates`, null, token);
  const siyCats = siyCatRes.categoryRates || siyCatRes.rates || siyCatRes || [];
  const siyPrivateRate = (Array.isArray(siyCats) ? siyCats : []).find(
    c => (c.lesson_category || c.lessonCategory) === 'private'
  );
  if (siyPrivateRate) {
    const rateVal = parseFloat(siyPrivateRate.rate_value || siyPrivateRate.rateValue);
    const rateType = siyPrivateRate.rate_type || siyPrivateRate.rateType;
    log(`  ${siyabendName} private category: ${rateType} €${rateVal}/h`);
    assert(rateType === 'fixed' && rateVal === 20,
      `${siyabendName}: private category = fixed €20/h`);
  } else {
    fail(`${siyabendName}: private category rate not found`);
  }

  // Verify manager commission settings
  title('2c · Verifying Manager Commission Settings');
  const managersRes = await apiOk('GET', '/manager/commissions/admin/managers', null, token);
  const managers = managersRes.data || managersRes || [];
  const manager = managers.find(m => (m.id || m.user_id || m.userId) === OGUZHAN_ID);
  assert(!!manager, `Manager found: ${oguzhanName}`);
  const managerId = manager?.id || manager?.user_id || manager?.userId;

  if (manager) {
    const mgrSettings = await apiOk('GET', `/manager/commissions/admin/managers/${managerId}/settings`, null, token);
    const settings = mgrSettings.data || mgrSettings.settings || mgrSettings;
    const bookingRate = parseFloat(settings.bookingRate || settings.booking_rate || 0);
    log(`  Manager booking commission: ${bookingRate}%`);
    assert(bookingRate === MGR_BOOKING_RATE, `Manager booking rate = ${MGR_BOOKING_RATE}% (got ${bookingRate}%)`);
  }

  // ════════════════════════════════════════════════════════════════════
  //  3 · Create 4 Customers
  // ════════════════════════════════════════════════════════════════════
  title('3 · Creating Customers');
  const roles = await apiOk('GET', '/roles', null, token);
  const studentRole = (Array.isArray(roles) ? roles : roles.roles || []).find(r => r.name === 'student');
  if (!studentRole) throw new Error('Student role not found');

  const c1 = await createCustomer(PROFILES, studentRole.id, token);
  ok(`C1: ${c1.profile.first_name} ${c1.profile.last_name} (${c1.profile.email})`);

  const c2 = await createCustomer(PROFILES, studentRole.id, token);
  ok(`C2: ${c2.profile.first_name} ${c2.profile.last_name} (${c2.profile.email})`);

  const c3 = await createCustomer(PROFILES, studentRole.id, token);
  ok(`C3: ${c3.profile.first_name} ${c3.profile.last_name} (${c3.profile.email})`);

  const c4 = await createCustomer(TURKISH_PROFILES, studentRole.id, token);
  ok(`C4: ${c4.profile.first_name} ${c4.profile.last_name} (${c4.profile.email})`);

  // ════════════════════════════════════════════════════════════════════
  //  4 · Fund Wallets
  // ════════════════════════════════════════════════════════════════════
  const WALLET_AMOUNT = 5000;
  title(`4 · Funding wallets → €${WALLET_AMOUNT} each`);
  for (const c of [c1, c2, c3, c4]) {
    await fundWallet(c.userId, WALLET_AMOUNT, token);
  }
  ok('All wallets funded');

  // ════════════════════════════════════════════════════════════════════
  //  5 · S1: C1 → Elif → Beginner Package (3×2h)
  // ════════════════════════════════════════════════════════════════════
  title(`5 · S1: C1 → ${elifName} → ${BEG_PKG_NAME} (3×2h)`);

  const c1PkgBody = {
    customerId: c1.userId,
    servicePackageId: BEG_PKG_ID,
    packageName: BEG_PKG_NAME,
    totalHours: BEG_PKG_HOURS,
    purchasePrice: BEG_PKG_PRICE,
    currency: 'EUR',
    includesLessons: true,
    includesRental: BEG_RENTAL_DAYS > 0,
    includesAccommodation: BEG_NIGHTS > 0,
    packageType: 'all_inclusive',
    rentalServiceId: BEG_RENTAL_SVC,
  };
  if (BEG_RENTAL_DAYS > 0) c1PkgBody.rentalDays = BEG_RENTAL_DAYS;
  if (BEG_NIGHTS > 0) {
    c1PkgBody.accommodationNights = BEG_NIGHTS;
    c1PkgBody.accommodationUnitId = BEG_ACCOM_UNIT;
  }

  const c1Pkg = await apiOk('POST', '/services/customer-packages', c1PkgBody, token);
  const c1CpId = c1Pkg.id;
  ok(`C1 beginner package: ${c1CpId}`);

  const S1_SESSIONS = [2, 2, 2]; // 6h from the 12h package
  const s1Bookings = await bookAndCompleteLessons(
    S1_SESSIONS, c1.userId, ELIF_ID, BEG_LESSON_SVC, token, 1,
    { use_package: true, customer_package_id: c1CpId }
  );

  // ════════════════════════════════════════════════════════════════════
  //  6 · S2: C2 → Oğuzhan → Starter Package (3×2h)
  // ════════════════════════════════════════════════════════════════════
  title(`6 · S2: C2 → ${oguzhanName} → ${STARTER_PKG_NAME} (3×2h)`);

  const c2Pkg = await apiOk('POST', '/services/customer-packages', {
    customerId: c2.userId,
    servicePackageId: STARTER_PKG_ID,
    packageName: STARTER_PKG_NAME,
    totalHours: STARTER_PKG_HOURS,
    purchasePrice: STARTER_PKG_PRICE,
    currency: 'EUR',
    includesLessons: true,
    includesRental: false,
    includesAccommodation: false,
    packageType: 'lesson',
  }, token);
  const c2CpId = c2Pkg.id;
  ok(`C2 starter package: ${c2CpId}`);

  const S2_SESSIONS = [2, 2, 2]; // 6h total
  const s2Bookings = await bookAndCompleteLessons(
    S2_SESSIONS, c2.userId, OGUZHAN_ID, PRIVATE_LESSON_SERVICE_ID, token, 10,
    { use_package: true, customer_package_id: c2CpId }
  );

  // ════════════════════════════════════════════════════════════════════
  //  7 · S3: C3 → Oğuzhan → Individual (2×2h)
  // ════════════════════════════════════════════════════════════════════
  title(`7 · S3: C3 → ${oguzhanName} → Individual lessons (2×2h)`);

  const S3_SESSIONS = [2, 2];
  const s3Bookings = await bookAndCompleteLessons(
    S3_SESSIONS, c3.userId, OGUZHAN_ID, PRIVATE_LESSON_SERVICE_ID, token, 20,
    { amount: PRIVATE_LESSON_PRICE * 2 }  // €90 × 2h = €180 per booking
  );

  // ════════════════════════════════════════════════════════════════════
  //  8 · S4: C4 → Siyabend → Starter Package (3×2h)
  // ════════════════════════════════════════════════════════════════════
  title(`8 · S4: C4 → ${siyabendName} → ${STARTER_PKG_NAME} (3×2h)`);

  const c4Pkg = await apiOk('POST', '/services/customer-packages', {
    customerId: c4.userId,
    servicePackageId: STARTER_PKG_ID,
    packageName: STARTER_PKG_NAME,
    totalHours: STARTER_PKG_HOURS,
    purchasePrice: STARTER_PKG_PRICE,
    currency: 'EUR',
    includesLessons: true,
    includesRental: false,
    includesAccommodation: false,
    packageType: 'lesson',
  }, token);
  const c4CpId = c4Pkg.id;
  ok(`C4 starter package: ${c4CpId}`);

  const S4_SESSIONS = [2, 2, 2]; // 6h total
  const s4Bookings = await bookAndCompleteLessons(
    S4_SESSIONS, c4.userId, SIYABEND_ID, PRIVATE_LESSON_SERVICE_ID, token, 30,
    { use_package: true, customer_package_id: c4CpId }
  );

  // ════════════════════════════════════════════════════════════════════
  //  9 · S5: C4 → Siyabend → Individual (2×1h)
  // ════════════════════════════════════════════════════════════════════
  title(`9 · S5: C4 → ${siyabendName} → Individual lessons (2×1h)`);

  const S5_SESSIONS = [1, 1];
  const s5Bookings = await bookAndCompleteLessons(
    S5_SESSIONS, c4.userId, SIYABEND_ID, PRIVATE_LESSON_SERVICE_ID, token, 40,
    { amount: PRIVATE_LESSON_PRICE * 1 }  // €90 × 1h = €90 per booking
  );

  // ════════════════════════════════════════════════════════════════════
  //  10 · Verify Instructor Earnings — Elif Sarı (S1 only)
  // ════════════════════════════════════════════════════════════════════
  title(`10 · ${elifName} Instructor Earnings Verification`);

  const elifEarningsRes = await apiOk('GET', `/finances/instructor-earnings/${ELIF_ID}`, null, token);
  const elifAllEarnings = elifEarningsRes.earnings || [];
  const s1BookingIds = new Set(s1Bookings.map(b => b.id));
  const elifOurEarnings = elifAllEarnings.filter(e => s1BookingIds.has(e.booking_id));

  assert(elifOurEarnings.length === s1Bookings.length,
    `${elifName}: ${s1Bookings.length} bookings → ${elifOurEarnings.length} earnings`);

  for (const e of elifOurEarnings) {
    assertClose(e.lesson_amount || 0, S1_LESSON_AMOUNT,
      `${elifName} S1 lesson_amount`);
    assertClose(e.total_earnings || 0, S1_INSTRUCTOR_EARNING,
      `${elifName} S1 total_earnings (30% × €${S1_LESSON_AMOUNT})`);
    assert(
      (e.commission_type === 'percentage') && (Math.abs(parseFloat(e.commission_rate) - 30) < 0.01 || Math.abs(parseFloat(e.commission_rate) - 0.30) < 0.01),
      `${elifName} S1 commission_type=percentage rate=30`
    );
  }

  const elifTotal = elifOurEarnings.reduce((s, e) => s + (e.total_earnings || 0), 0);
  assertClose(elifTotal, S1_INSTRUCTOR_EARNING * S1_SESSIONS.length,
    `${elifName} total S1 earnings (${S1_SESSIONS.length} × €${S1_INSTRUCTOR_EARNING})`);

  // ════════════════════════════════════════════════════════════════════
  //  11 · Verify Instructor Earnings — Oğuzhan Bentürk (S2 + S3)
  // ════════════════════════════════════════════════════════════════════
  title(`11 · ${oguzhanName} Instructor Earnings Verification`);

  const oguzEarningsRes = await apiOk('GET', `/finances/instructor-earnings/${OGUZHAN_ID}`, null, token);
  const oguzAllEarnings = oguzEarningsRes.earnings || [];

  // S2 bookings (starter package)
  const s2BookingIds = new Set(s2Bookings.map(b => b.id));
  const oguzS2Earnings = oguzAllEarnings.filter(e => s2BookingIds.has(e.booking_id));
  assert(oguzS2Earnings.length === s2Bookings.length,
    `${oguzhanName} S2: ${s2Bookings.length} bookings → ${oguzS2Earnings.length} earnings`);

  for (const e of oguzS2Earnings) {
    assertClose(e.lesson_amount || 0, S2_LESSON_AMOUNT,
      `${oguzhanName} S2 lesson_amount (€470/6h × 2h)`);
    assertClose(e.total_earnings || 0, S2_INSTRUCTOR_EARNING,
      `${oguzhanName} S2 total_earnings (30% × €${S2_LESSON_AMOUNT})`);
  }

  // S3 bookings (individual)
  const s3BookingIds = new Set(s3Bookings.map(b => b.id));
  const oguzS3Earnings = oguzAllEarnings.filter(e => s3BookingIds.has(e.booking_id));
  assert(oguzS3Earnings.length === s3Bookings.length,
    `${oguzhanName} S3: ${s3Bookings.length} bookings → ${oguzS3Earnings.length} earnings`);

  for (const e of oguzS3Earnings) {
    assertClose(e.lesson_amount || 0, S3_LESSON_AMOUNT,
      `${oguzhanName} S3 lesson_amount (€90 × 2h)`);
    assertClose(e.total_earnings || 0, S3_INSTRUCTOR_EARNING,
      `${oguzhanName} S3 total_earnings (30% × €${S3_LESSON_AMOUNT})`);
  }

  const oguzTotal = [...oguzS2Earnings, ...oguzS3Earnings].reduce((s, e) => s + (e.total_earnings || 0), 0);
  const oguzExpected = (S2_INSTRUCTOR_EARNING * S2_SESSIONS.length) + (S3_INSTRUCTOR_EARNING * S3_SESSIONS.length);
  assertClose(oguzTotal, oguzExpected,
    `${oguzhanName} total earnings (S2+S3): €${oguzExpected}`);

  // ════════════════════════════════════════════════════════════════════
  //  12 · Verify Instructor Earnings — Siyabend Şanlı (S4 + S5)
  //       Category rate (private=€20/h) must be applied, NOT default €50/h
  // ════════════════════════════════════════════════════════════════════
  title(`12 · ${siyabendName} Instructor Earnings Verification (category vs default)`);

  const siyEarningsRes = await apiOk('GET', `/finances/instructor-earnings/${SIYABEND_ID}`, null, token);
  const siyAllEarnings = siyEarningsRes.earnings || [];

  // S4 bookings (starter package, category=private → €20/h)
  const s4BookingIds = new Set(s4Bookings.map(b => b.id));
  const siyS4Earnings = siyAllEarnings.filter(e => s4BookingIds.has(e.booking_id));
  assert(siyS4Earnings.length === s4Bookings.length,
    `${siyabendName} S4: ${s4Bookings.length} bookings → ${siyS4Earnings.length} earnings`);

  for (const e of siyS4Earnings) {
    assertClose(e.lesson_amount || 0, S4_LESSON_AMOUNT,
      `${siyabendName} S4 lesson_amount (€470/6h × 2h)`);
    assertClose(e.total_earnings || 0, S4_INSTRUCTOR_EARNING,
      `${siyabendName} S4 total_earnings (€20/h × 2h = €40, NOT €50/h default)`);
    // Verify category rate was used, not default
    const rate = parseFloat(e.commission_rate);
    // In display layer commission_rate can be stored as decimal (0.20) or raw (20)
    const effectiveRate = rate < 1 ? rate * 100 : rate;
    assert(Math.abs(effectiveRate - 20) < 0.1,
      `${siyabendName} S4 category rate=€20/h applied (got ${effectiveRate})`);
  }

  // S5 bookings (individual, category=private → €20/h)
  const s5BookingIds = new Set(s5Bookings.map(b => b.id));
  const siyS5Earnings = siyAllEarnings.filter(e => s5BookingIds.has(e.booking_id));
  assert(siyS5Earnings.length === s5Bookings.length,
    `${siyabendName} S5: ${s5Bookings.length} bookings → ${siyS5Earnings.length} earnings`);

  for (const e of siyS5Earnings) {
    assertClose(e.lesson_amount || 0, S5_LESSON_AMOUNT,
      `${siyabendName} S5 lesson_amount (€90 × 1h)`);
    assertClose(e.total_earnings || 0, S5_INSTRUCTOR_EARNING,
      `${siyabendName} S5 total_earnings (€20/h × 1h = €20, NOT €50/h default)`);
  }

  const siyTotal = [...siyS4Earnings, ...siyS5Earnings].reduce((s, e) => s + (e.total_earnings || 0), 0);
  const siyExpected = (S4_INSTRUCTOR_EARNING * S4_SESSIONS.length) + (S5_INSTRUCTOR_EARNING * S5_SESSIONS.length);
  assertClose(siyTotal, siyExpected,
    `${siyabendName} total earnings (S4+S5): €${siyExpected}`);

  // ════════════════════════════════════════════════════════════════════
  //  13 · Verify Manager Commissions (all 13 bookings → 10% each)
  // ════════════════════════════════════════════════════════════════════
  title(`13 · Manager Commission Verification (${oguzhanName})`);

  if (!managerId) {
    warn('Manager not found — skipping commission verification');
  } else {
    const mgCommRes = await apiOk(
      'GET', `/manager/commissions/admin/managers/${managerId}/commissions?limit=500`, null, token
    );
    const mgComm = mgCommRes.data || mgCommRes || [];

    // All our booking IDs
    const allBookingIds = new Set([
      ...s1Bookings.map(b => b.id),
      ...s2Bookings.map(b => b.id),
      ...s3Bookings.map(b => b.id),
      ...s4Bookings.map(b => b.id),
      ...s5Bookings.map(b => b.id),
    ]);

    const ourComm = mgComm.filter(c =>
      allBookingIds.has(c.source_id) || allBookingIds.has(c.booking_id) || allBookingIds.has(c.sourceId)
    );

    assert(ourComm.length === allBookingIds.size,
      `Manager commissions: ${ourComm.length} records (expected ${allBookingIds.size})`);

    // Verify each scenario's commission amounts
    function verifyMgrCommissions(bookings, expectedSourceAmt, expectedCommAmt, label) {
      const ids = new Set(bookings.map(b => b.id));
      const matched = ourComm.filter(c => ids.has(c.source_id) || ids.has(c.booking_id) || ids.has(c.sourceId));
      assert(matched.length === bookings.length,
        `${label}: ${matched.length} commission records (expected ${bookings.length})`);
      for (const c of matched) {
        const srcAmt = parseFloat(c.source_amount ?? c.sourceAmount ?? 0);
        const commAmt = parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0);
        assertClose(srcAmt, expectedSourceAmt, `${label} source_amount`);
        assertClose(commAmt, expectedCommAmt, `${label} commission_amount (${MGR_BOOKING_RATE}%)`);
      }
    }

    verifyMgrCommissions(s1Bookings, S1_LESSON_AMOUNT, S1_MGR_COMMISSION, 'S1 (Elif/Beginner)');
    verifyMgrCommissions(s2Bookings, S2_LESSON_AMOUNT, S2_MGR_COMMISSION, 'S2 (Oğuzhan/Starter)');
    verifyMgrCommissions(s3Bookings, S3_LESSON_AMOUNT, S3_MGR_COMMISSION, 'S3 (Oğuzhan/Individual)');
    verifyMgrCommissions(s4Bookings, S4_LESSON_AMOUNT, S4_MGR_COMMISSION, 'S4 (Siyabend/Starter)');
    verifyMgrCommissions(s5Bookings, S5_LESSON_AMOUNT, S5_MGR_COMMISSION, 'S5 (Siyabend/Individual)');

    // Total manager commission from all our bookings
    const totalMgrComm = ourComm.reduce(
      (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
    );
    const expectedTotalMgr =
      (S1_MGR_COMMISSION * S1_SESSIONS.length) +
      (S2_MGR_COMMISSION * S2_SESSIONS.length) +
      (S3_MGR_COMMISSION * S3_SESSIONS.length) +
      (S4_MGR_COMMISSION * S4_SESSIONS.length) +
      (S5_MGR_COMMISSION * S5_SESSIONS.length);
    assertClose(totalMgrComm, expectedTotalMgr,
      `Total manager commission: €${expectedTotalMgr.toFixed(2)}`, 0.20);

    // ── Dual-role check: Oğuzhan is both instructor (S2,S3) and manager
    title('13b · Dual-Role Verification (Oğuzhan)');
    const oguzhanBookingIds = new Set([
      ...s2Bookings.map(b => b.id),
      ...s3Bookings.map(b => b.id),
    ]);
    const oguzInstructorRecords = [...oguzS2Earnings, ...oguzS3Earnings];
    const oguzManagerRecords = ourComm.filter(c =>
      oguzhanBookingIds.has(c.source_id) || oguzhanBookingIds.has(c.booking_id)
    );

    assert(oguzInstructorRecords.length === (S2_SESSIONS.length + S3_SESSIONS.length),
      `Oğuzhan has ${oguzInstructorRecords.length} instructor earnings (expected ${S2_SESSIONS.length + S3_SESSIONS.length})`);
    assert(oguzManagerRecords.length === (S2_SESSIONS.length + S3_SESSIONS.length),
      `Oğuzhan has ${oguzManagerRecords.length} manager commissions for same bookings`);

    // Both should exist — not double-counted but separate
    const totalInstructorPay = oguzInstructorRecords.reduce((s, e) => s + (e.total_earnings || 0), 0);
    const totalManagerPay = oguzManagerRecords.reduce(
      (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? 0), 0
    );
    log(`  Instructor pay: €${totalInstructorPay.toFixed(2)} (${oguzInstructorRecords.length} records)`);
    log(`  Manager commission: €${totalManagerPay.toFixed(2)} (${oguzManagerRecords.length} records)`);
    assert(totalInstructorPay > 0 && totalManagerPay > 0,
      `Oğuzhan: both instructor pay (€${totalInstructorPay.toFixed(2)}) and manager commission (€${totalManagerPay.toFixed(2)}) > 0`);
  }

  // ════════════════════════════════════════════════════════════════════
  //  SUMMARY
  // ════════════════════════════════════════════════════════════════════
  title('RESULTS');
  log(`\n  Passed: ${passedTests} / ${totalTests}`);
  if (passedTests === totalTests) {
    ok('ALL TESTS PASSED  ✅');
  } else {
    fail(`${totalTests - passedTests} TEST(S) FAILED`);
  }
  log('');
}

main().catch(err => {
  console.error('\n💥 FATAL:', err.message || err);
  console.error(err.stack);
  process.exit(1);
});
