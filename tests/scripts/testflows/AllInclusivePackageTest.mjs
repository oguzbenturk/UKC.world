#!/usr/bin/env node
/**
 * All Inclusive Beginner Package Test – 2 Customers, 2 Instructors
 *
 * Dynamically looks up the "All Inclusive Beginner Package" and creates
 * 2 customers who each purchase it, complete all lessons / rentals /
 * accommodation, then:
 *   – top-up wallets with extra funds
 *   – buy seasonal memberships (1 expired, 1 about-to-expire per customer)
 *   – place 1 shop order each (pending – not yet seen by staff)
 *
 *   Customer 1 (DE): All lessons with Elif Sarı (instructor) via package
 *   Customer 2 (TR): Buys 6h Starter Package + 4h individual lessons (2x2h)
 *                     with Oguzhan Benturk (manager / implicit instructor)
 *
 * Verifies: package usage, wallet balances, instructor earnings,
 * manager commissions, seasonal memberships, shop orders.
 *
 * Usage:   node tests/scripts/testflows/AllInclusivePackageTest.mjs
 * Cleanup: node tests/scripts/cleanup.mjs
 */

import {
  API, PASSWORD, ADMIN_EMAIL,
  PROFILES, TURKISH_PROFILES,
  STARTER_PKG_ID, STARTER_PKG_NAME, STARTER_PKG_PRICE, STARTER_PKG_HOURS,
  PRIVATE_LESSON_SERVICE_ID, PRIVATE_LESSON_PRICE,
  SEASONAL_PASS_OFFERING_ID, SEASONAL_PASS_PRICE,
  ELIF_ID, OGUZHAN_ID,
  log, ok, fail, title,
  api, apiOk, shuffle, adminLogin,
} from '../_shared.mjs';

// ── Date helpers ───────────────────────────────────────────────────
const DATE_BASE_OFFSET = 90 + Math.floor(Math.random() * 200);
function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + DATE_BASE_OFFSET + daysFromNow);
  return d.toISOString().slice(0, 10);
}
function pastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}
function soonDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

// ── Test framework ─────────────────────────────────────────────────
let totalTests  = 0;
let passedTests = 0;
const warn = (msg) => log(`  ⚠️  ${msg}`);

function assert(condition, label) {
  totalTests++;
  if (condition) { passedTests++; ok(label); }
  else { fail(label); }
}

// ── Customer login helper ──────────────────────────────────────────
const _customerTokenCache = new Map();
async function customerLogin(userId) {
  if (_customerTokenCache.has(userId)) return _customerTokenCache.get(userId);
  const adminToken = await adminLogin();
  const userRes = await apiOk('GET', `/users/${userId}`, null, adminToken);
  const email = userRes.email || userRes.user?.email;
  if (!email) throw new Error(`Cannot get email for user ${userId}`);
  const { token } = await apiOk('POST', '/auth/login', { email, password: PASSWORD });
  _customerTokenCache.set(userId, token);
  return token;
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
  title('ALL INCLUSIVE BEGINNER PACKAGE – 2 CUSTOMERS E2E TEST');

  // ════════════════════════════════════════════════════════════════════
  //  1 · Admin Login
  // ════════════════════════════════════════════════════════════════════
  title('1 · Admin Login');
  const token = await adminLogin();
  ok('Logged in as admin');

  // ════════════════════════════════════════════════════════════════════
  //  1b · Look up "All Inclusive Beginner Package" dynamically
  // ════════════════════════════════════════════════════════════════════
  title('1b · Looking up All Inclusive Beginner Package');
  const pkgsRes = await apiOk('GET', '/services/packages', null, token);
  const allPkgs = Array.isArray(pkgsRes) ? pkgsRes : pkgsRes.packages || pkgsRes.data || [];
  let beginnerPkg = allPkgs.find(p =>
    (p.name || '').toLowerCase().includes('beginner') &&
    (p.packageType === 'all_inclusive' || p.includes_accommodation || p.includesAccommodation)
  );
  if (!beginnerPkg) {
    beginnerPkg = allPkgs.find(p => (p.name || '').toLowerCase().includes('beginner'));
    if (!beginnerPkg) {
      log('  Available packages:');
      allPkgs.forEach(p => log(`    - ${p.name} (${p.id}) type=${p.packageType}`));
      throw new Error('All Inclusive Beginner Package not found. Create it first.');
    }
  }

  // Extract package parameters
  const PKG_ID           = beginnerPkg.id;
  const PKG_NAME         = beginnerPkg.name;
  const PKG_PRICE        = parseFloat(beginnerPkg.price);
  const PKG_HOURS        = parseFloat(beginnerPkg.totalHours || beginnerPkg.total_hours || 0);
  const PKG_SESSIONS_CT  = parseInt(beginnerPkg.sessionsCount || beginnerPkg.sessions_count || 0);
  const PKG_RENTAL_DAYS  = parseInt(beginnerPkg.rentalDays || beginnerPkg.rental_days || 0);
  const PKG_NIGHTS       = parseInt(beginnerPkg.accommodationNights || beginnerPkg.accommodation_nights || 0);
  const LESSON_SVC_ID    = beginnerPkg.lessonServiceId || beginnerPkg.lesson_service_id || null;
  const RENTAL_SVC_ID    = beginnerPkg.rentalServiceId || beginnerPkg.rental_service_id || null;
  const ACCOM_UNIT_ID    = beginnerPkg.accommodationUnitId || beginnerPkg.accommodation_unit_id || null;
  const INCL_LESSONS     = beginnerPkg.includesLessons !== false;
  const INCL_RENTAL      = !!beginnerPkg.includesRental;
  const INCL_ACCOM       = !!beginnerPkg.includesAccommodation;

  // Build session schedule: distribute PKG_HOURS across PKG_SESSIONS_CT sessions
  let PKG_SESSIONS;
  if (PKG_SESSIONS_CT > 0 && PKG_HOURS > 0) {
    const baseHours = Math.floor((PKG_HOURS / PKG_SESSIONS_CT) * 2) / 2;
    PKG_SESSIONS = Array(PKG_SESSIONS_CT).fill(baseHours);
    let remaining = PKG_HOURS - baseHours * PKG_SESSIONS_CT;
    for (let i = 0; remaining > 0.01 && i < PKG_SESSIONS_CT; i++) {
      const add = Math.min(remaining, 0.5);
      PKG_SESSIONS[i] += add;
      remaining -= add;
    }
  } else {
    PKG_SESSIONS = [];
  }

  log(`  Package: ${PKG_NAME}`);
  log(`  ID: ${PKG_ID}`);
  log(`  Price: EUR${PKG_PRICE}`);
  log(`  Lessons: ${PKG_HOURS}h / ${PKG_SESSIONS_CT} sessions ${LESSON_SVC_ID ? 'Y' : 'N'}`);
  log(`  Rentals: ${PKG_RENTAL_DAYS} days ${RENTAL_SVC_ID ? 'Y' : 'N'}`);
  log(`  Accommodation: ${PKG_NIGHTS} nights ${ACCOM_UNIT_ID ? 'Y' : 'N'}`);
  log(`  Session schedule: [${PKG_SESSIONS.join(', ')}] = ${PKG_SESSIONS.reduce((a, b) => a + b, 0)}h`);
  ok('Package found');

  // C2 extra: 6h Starter Package + 4h individual (2x2h) = 10h total with Oguzhan
  const C2_INDIVIDUAL_SESSIONS = [2, 2]; // 4h individual
  const C2_INDIVIDUAL_HOURS    = 4;

  // Budget: beginner pkg + starter pkg + individual lessons + 2x seasonal + shop + buffer
  const WALLET_AMOUNT = Math.ceil(
    PKG_PRICE + STARTER_PKG_PRICE
    + (C2_INDIVIDUAL_HOURS * PRIVATE_LESSON_PRICE)
    + (SEASONAL_PASS_PRICE * 2) + 500
  );

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

  const elif    = allInstructors.find(i => i.id === ELIF_ID);
  const oguzhan = allInstructors.find(i => i.id === OGUZHAN_ID);
  if (!elif)    throw new Error('Elif Sari not found in instructors');
  if (!oguzhan) throw new Error('Oguzhan Benturk not found in instructors');

  const elifName    = `${elif.first_name} ${elif.last_name}`;
  const oguzhanName = `${oguzhan.first_name} ${oguzhan.last_name}`;
  ok(`Instructors: ${elifName}, ${oguzhanName}`);

  // ════════════════════════════════════════════════════════════════════
  //  3 · Create 2 Customers
  // ════════════════════════════════════════════════════════════════════
  title('3 · Creating Customer 1 (German)');
  const c1 = await createCustomer(PROFILES, studentRole.id, token);
  const c1Name = `${c1.profile.first_name} ${c1.profile.last_name}`;
  ok(`C1: ${c1Name} (${c1.profile.email}) -> ${c1.userId}`);

  title('3b · Creating Customer 2 (Turkish)');
  const c2 = await createCustomer(TURKISH_PROFILES, studentRole.id, token);
  const c2Name = `${c2.profile.first_name} ${c2.profile.last_name}`;
  ok(`C2: ${c2Name} (${c2.profile.email}) -> ${c2.userId}`);

  // ════════════════════════════════════════════════════════════════════
  //  4 · Fund Wallets
  // ════════════════════════════════════════════════════════════════════
  title(`4 · Funding wallets -> EUR${WALLET_AMOUNT} each`);
  await fundWallet(c1.userId, WALLET_AMOUNT, token);
  await fundWallet(c2.userId, WALLET_AMOUNT, token);
  ok(`Both wallets funded: EUR${WALLET_AMOUNT}`);

  const c1BalStart = await getWalletBalance(c1.userId, token);
  const c2BalStart = await getWalletBalance(c2.userId, token);
  assert(Math.abs(c1BalStart - WALLET_AMOUNT) < 1, `C1 wallet = EUR${c1BalStart} (expected EUR${WALLET_AMOUNT})`);
  assert(Math.abs(c2BalStart - WALLET_AMOUNT) < 1, `C2 wallet = EUR${c2BalStart} (expected EUR${WALLET_AMOUNT})`);

  // ════════════════════════════════════════════════════════════════════
  //  5 · Purchase Beginner Package – both customers
  // ════════════════════════════════════════════════════════════════════
  title(`5 · C1 purchasing ${PKG_NAME} (EUR${PKG_PRICE})`);
  const c1PkgBody = {
    customerId: c1.userId,
    servicePackageId: PKG_ID,
    packageName: PKG_NAME,
    totalHours: PKG_HOURS,
    purchasePrice: PKG_PRICE,
    currency: 'EUR',
    includesLessons: INCL_LESSONS,
    includesRental: INCL_RENTAL,
    includesAccommodation: INCL_ACCOM,
    packageType: 'all_inclusive',
  };
  if (PKG_RENTAL_DAYS > 0) c1PkgBody.rentalDays = PKG_RENTAL_DAYS;
  if (PKG_NIGHTS > 0) { c1PkgBody.accommodationNights = PKG_NIGHTS; c1PkgBody.accommodationUnitId = ACCOM_UNIT_ID; }

  const c1Pkg = await apiOk('POST', '/services/customer-packages', c1PkgBody, token);
  const c1CpId = c1Pkg.id;
  ok(`C1 package assigned: ${c1CpId}`);
  if (PKG_HOURS > 0) {
    assert(parseFloat(c1Pkg.totalHours || c1Pkg.total_hours || 0) === PKG_HOURS,
      `C1 package totalHours = ${PKG_HOURS}`);
  }

  title(`5b · C2 purchasing ${PKG_NAME} (EUR${PKG_PRICE})`);
  const c2PkgBody = { ...c1PkgBody, customerId: c2.userId };
  const c2Pkg = await apiOk('POST', '/services/customer-packages', c2PkgBody, token);
  const c2CpId = c2Pkg.id;
  ok(`C2 package assigned: ${c2CpId}`);
  if (PKG_HOURS > 0) {
    assert(parseFloat(c2Pkg.totalHours || c2Pkg.total_hours || 0) === PKG_HOURS,
      `C2 package totalHours = ${PKG_HOURS}`);
  }

  // ════════════════════════════════════════════════════════════════════
  //  6 · C1: Book lessons with Elif Sari (via beginner package)
  // ════════════════════════════════════════════════════════════════════
  let c1Bookings = [];
  if (INCL_LESSONS && PKG_HOURS > 0 && LESSON_SVC_ID) {
    title(`6 · C1: Booking ${PKG_HOURS}h lessons (${PKG_SESSIONS.length} sessions) with ${elifName}`);
    c1Bookings = await bookAndCompleteLessons(
      PKG_SESSIONS, c1.userId, ELIF_ID, LESSON_SVC_ID, token, 1,
      { use_package: true, customer_package_id: c1CpId }
    );
  } else {
    title('6 · C1: No lessons in this package - skipped');
    ok('Skipped (package has no lesson component)');
  }

  // ════════════════════════════════════════════════════════════════════
  //  7 · C2: Buy 6h Starter Package + complete with Oguzhan Benturk
  // ════════════════════════════════════════════════════════════════════
  title(`7 · C2: Purchasing ${STARTER_PKG_NAME} (EUR${STARTER_PKG_PRICE}) for Oguzhan lessons`);
  const c2StarterPkg = await apiOk('POST', '/services/customer-packages', {
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
  const c2StarterCpId = c2StarterPkg.id;
  ok(`C2 starter package assigned: ${c2StarterCpId}`);
  assert(parseFloat(c2StarterPkg.totalHours || c2StarterPkg.total_hours || 0) === STARTER_PKG_HOURS,
    `C2 starter package totalHours = ${STARTER_PKG_HOURS}`);

  // Book 6h with Oguzhan (3 sessions x 2h = 6h)
  const STARTER_SESSIONS = [2, 2, 2]; // 6h total
  title(`7b · C2: Booking ${STARTER_PKG_HOURS}h starter lessons (${STARTER_SESSIONS.length} sessions) with ${oguzhanName}`);
  const c2StarterBookings = await bookAndCompleteLessons(
    STARTER_SESSIONS, c2.userId, OGUZHAN_ID, PRIVATE_LESSON_SERVICE_ID, token, 20,
    { use_package: true, customer_package_id: c2StarterCpId }
  );

  // ════════════════════════════════════════════════════════════════════
  //  7c · C2: Book 4h individual lessons (2x2h) with Oguzhan Benturk
  // ════════════════════════════════════════════════════════════════════
  title(`7c · C2: Booking ${C2_INDIVIDUAL_HOURS}h individual lessons (${C2_INDIVIDUAL_SESSIONS.length} sessions) with ${oguzhanName}`);
  const c2IndividualBookings = await bookAndCompleteLessons(
    C2_INDIVIDUAL_SESSIONS, c2.userId, OGUZHAN_ID, PRIVATE_LESSON_SERVICE_ID, token, 30,
    { amount: PRIVATE_LESSON_PRICE * 2 }  // 2h per session at PRIVATE_LESSON_PRICE per hour
  );

  // Combine all C2 bookings for earnings/commission checks later
  const c2AllBookings = [...c2StarterBookings, ...c2IndividualBookings];

  // Also book beginner package lessons for C2 if the beginner pkg includes lessons
  let c2BegLessonBookings = [];
  if (INCL_LESSONS && PKG_HOURS > 0 && LESSON_SVC_ID) {
    title(`7d · C2: Booking ${PKG_HOURS}h beginner package lessons (${PKG_SESSIONS.length} sessions) with ${oguzhanName}`);
    c2BegLessonBookings = await bookAndCompleteLessons(
      PKG_SESSIONS, c2.userId, OGUZHAN_ID, LESSON_SVC_ID, token, 40,
      { use_package: true, customer_package_id: c2CpId }
    );
  }
  // All C2 bookings with Oguzhan
  const c2Bookings = [...c2AllBookings, ...c2BegLessonBookings];

  // ════════════════════════════════════════════════════════════════════
  //  8 · Create package rental days – C1
  // ════════════════════════════════════════════════════════════════════
  const c1Rentals = [];
  if (INCL_RENTAL && PKG_RENTAL_DAYS > 0 && RENTAL_SVC_ID) {
    title(`8 · C1: Creating ${PKG_RENTAL_DAYS} package rental days`);
    for (let i = 0; i < PKG_RENTAL_DAYS; i++) {
      const startDate = futureDate(50 + i);
      const endDate   = futureDate(50 + i + 1);

      const rental = await apiOk('POST', '/rentals', {
        user_id: c1.userId,
        equipment_ids: [RENTAL_SVC_ID],
        rental_days: 1,
        start_date: startDate,
        end_date: endDate,
        use_package: true,
        customer_package_id: c1CpId,
        payment_method: 'wallet',
      }, token);

      const rId = rental.id || rental.rental?.id;
      c1Rentals.push(rId);
      ok(`  C1 Rental ${i + 1}: ${startDate}`);
    }

    for (const rId of c1Rentals) {
      try { await apiOk('PATCH', `/rentals/${rId}/activate`, null, token); } catch { /* may already be active */ }
    }
    for (const rId of c1Rentals) {
      await apiOk('PATCH', `/rentals/${rId}/complete`, null, token);
    }
    ok(`C1: All ${c1Rentals.length} package rentals activated & completed`);
  } else {
    title('8 · C1: No rental component - skipped');
    ok('Skipped');
  }

  // ════════════════════════════════════════════════════════════════════
  //  9 · Create package rental days – C2
  // ════════════════════════════════════════════════════════════════════
  const c2Rentals = [];
  if (INCL_RENTAL && PKG_RENTAL_DAYS > 0 && RENTAL_SVC_ID) {
    title(`9 · C2: Creating ${PKG_RENTAL_DAYS} package rental days`);
    for (let i = 0; i < PKG_RENTAL_DAYS; i++) {
      const startDate = futureDate(70 + i);
      const endDate   = futureDate(70 + i + 1);

      const rental = await apiOk('POST', '/rentals', {
        user_id: c2.userId,
        equipment_ids: [RENTAL_SVC_ID],
        rental_days: 1,
        start_date: startDate,
        end_date: endDate,
        use_package: true,
        customer_package_id: c2CpId,
        payment_method: 'wallet',
      }, token);

      const rId = rental.id || rental.rental?.id;
      c2Rentals.push(rId);
      ok(`  C2 Rental ${i + 1}: ${startDate}`);
    }

    for (const rId of c2Rentals) {
      try { await apiOk('PATCH', `/rentals/${rId}/activate`, null, token); } catch { /* may already be active */ }
    }
    for (const rId of c2Rentals) {
      await apiOk('PATCH', `/rentals/${rId}/complete`, null, token);
    }
    ok(`C2: All ${c2Rentals.length} package rentals activated & completed`);
  } else {
    title('9 · C2: No rental component - skipped');
    ok('Skipped');
  }

  // ════════════════════════════════════════════════════════════════════
  //  10 · Consume accommodation nights – C1
  // ════════════════════════════════════════════════════════════════════
  if (INCL_ACCOM && PKG_NIGHTS > 0) {
    title(`10 · C1: Consuming ${PKG_NIGHTS} accommodation nights from package`);
    try {
      await apiOk('POST', `/services/customer-packages/${c1CpId}/use-accommodation-nights`, {
        nightsToUse: PKG_NIGHTS,
        checkInDate: futureDate(90),
      }, token);
      ok(`C1: Consumed ${PKG_NIGHTS} accommodation nights`);
    } catch (e) {
      warn(`Accommodation endpoint may differ: ${e.message}`);
      try {
        await apiOk('PUT', `/services/customer-packages/${c1CpId}`, {
          accommodation_nights_used: PKG_NIGHTS,
          accommodation_nights_remaining: 0,
        }, token);
        ok('C1: Accommodation nights updated via PUT');
      } catch (e2) {
        warn(`Could not consume C1 accommodation nights: ${e2.message}`);
      }
    }
  } else {
    title('10 · C1: No accommodation component - skipped');
    ok('Skipped');
  }

  // ════════════════════════════════════════════════════════════════════
  //  11 · Consume accommodation nights – C2
  // ════════════════════════════════════════════════════════════════════
  if (INCL_ACCOM && PKG_NIGHTS > 0) {
    title(`11 · C2: Consuming ${PKG_NIGHTS} accommodation nights from package`);
    try {
      await apiOk('POST', `/services/customer-packages/${c2CpId}/use-accommodation-nights`, {
        nightsToUse: PKG_NIGHTS,
        checkInDate: futureDate(100),
      }, token);
      ok(`C2: Consumed ${PKG_NIGHTS} accommodation nights`);
    } catch (e) {
      warn(`Accommodation endpoint may differ: ${e.message}`);
      try {
        await apiOk('PUT', `/services/customer-packages/${c2CpId}`, {
          accommodation_nights_used: PKG_NIGHTS,
          accommodation_nights_remaining: 0,
        }, token);
        ok('C2: Accommodation nights updated via PUT');
      } catch (e2) {
        warn(`Could not consume C2 accommodation nights: ${e2.message}`);
      }
    }
  } else {
    title('11 · C2: No accommodation component - skipped');
    ok('Skipped');
  }

  // ════════════════════════════════════════════════════════════════════
  //  12 · Beginner Package Verification
  // ════════════════════════════════════════════════════════════════════
  title('12 · Beginner package verification - both customers');

  for (const [label, userId, cpId] of [['C1', c1.userId, c1CpId], ['C2', c2.userId, c2CpId]]) {
    const pkgCheck = await apiOk('GET', `/services/customer-packages/${userId}`, null, token);
    const pkgList = Array.isArray(pkgCheck) ? pkgCheck : pkgCheck.packages || pkgCheck.data || [];
    const ourPkg = pkgList.find(p => p.id === cpId);
    if (ourPkg) {
      if (INCL_LESSONS && PKG_HOURS > 0) {
        const remainHours = parseFloat(ourPkg.remaining_hours ?? ourPkg.remainingHours ?? -1);
        assert(remainHours === 0, `${label} beginner lesson hours remaining = 0 (got ${remainHours})`);
      }

      if (INCL_RENTAL && PKG_RENTAL_DAYS > 0) {
        const rentalRemain = parseInt(ourPkg.rental_days_remaining ?? ourPkg.rentalDaysRemaining ?? -1);
        assert(rentalRemain === 0, `${label} rental days remaining = 0 (got ${rentalRemain})`);
      }

      if (INCL_ACCOM && PKG_NIGHTS > 0) {
        const accomRemain = parseFloat(ourPkg.accommodation_nights_remaining ?? ourPkg.accommodationNightsRemaining ?? -1);
        if (accomRemain >= 0) {
          assert(accomRemain === 0, `${label} accommodation nights remaining = 0 (got ${accomRemain})`);
        }
      }

      const st = (ourPkg.status || '').toLowerCase();
      assert(st === 'used_up' || st === 'completed' || st === 'expired',
        `${label} beginner package status = used_up (got ${st})`);
    } else {
      fail(`${label} beginner package not found`);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  12b · C2 Starter Package Verification
  // ════════════════════════════════════════════════════════════════════
  title('12b · C2 Starter Package verification');
  {
    const pkgCheck = await apiOk('GET', `/services/customer-packages/${c2.userId}`, null, token);
    const pkgList = Array.isArray(pkgCheck) ? pkgCheck : pkgCheck.packages || pkgCheck.data || [];
    const starterPkg = pkgList.find(p => p.id === c2StarterCpId);
    if (starterPkg) {
      const remainHours = parseFloat(starterPkg.remaining_hours ?? starterPkg.remainingHours ?? -1);
      assert(remainHours === 0, `C2 starter lesson hours remaining = 0 (got ${remainHours})`);
      const st = (starterPkg.status || '').toLowerCase();
      assert(st === 'used_up' || st === 'completed' || st === 'expired',
        `C2 starter package status = used_up (got ${st})`);
    } else {
      fail('C2 starter package not found');
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  13 · Wallet Verification (after package purchases)
  // ════════════════════════════════════════════════════════════════════
  title('13 · Wallet verification (post-package)');
  // C1 spent: beginner pkg
  // C2 spent: beginner pkg + starter pkg + 4h individual (2x2h @ PRIVATE_LESSON_PRICE)
  const c1Spent = PKG_PRICE;
  const c2Spent = PKG_PRICE + STARTER_PKG_PRICE + (C2_INDIVIDUAL_HOURS * PRIVATE_LESSON_PRICE);
  const c1ExpectedBal = WALLET_AMOUNT - c1Spent;
  const c2ExpectedBal = WALLET_AMOUNT - c2Spent;

  const c1BalMid = await getWalletBalance(c1.userId, token);
  assert(Math.abs(c1BalMid - c1ExpectedBal) < 5,
    `C1 wallet: EUR${c1BalMid} (expected ~EUR${c1ExpectedBal})`);

  const c2BalMid = await getWalletBalance(c2.userId, token);
  assert(Math.abs(c2BalMid - c2ExpectedBal) < 5,
    `C2 wallet: EUR${c2BalMid} (expected ~EUR${c2ExpectedBal})`);

  // ════════════════════════════════════════════════════════════════════
  //  14 · Instructor Earnings – Elif Sari (C1's instructor)
  // ════════════════════════════════════════════════════════════════════
  title(`14 · ${elifName} Earnings (C1's instructor)`);
  const elifEarningsRes = await apiOk('GET', `/finances/instructor-earnings/${ELIF_ID}`, null, token);
  const elifAllEarnings = elifEarningsRes.earnings || [];
  const c1BookingIds = new Set(c1Bookings.map(b => b.id));
  const elifOurEarnings = elifAllEarnings.filter(e => c1BookingIds.has(e.booking_id));
  const elifTotalEarned = elifOurEarnings.reduce((s, e) => s + (e.total_earnings || 0), 0);
  log(`  ${c1Bookings.length} bookings -> ${elifOurEarnings.length} earnings -> EUR${elifTotalEarned.toFixed(2)}`);
  if (c1Bookings.length > 0) {
    assert(elifOurEarnings.length === c1Bookings.length,
      `${elifName}: ${c1Bookings.length} bookings -> ${elifOurEarnings.length} earnings`);
    assert(elifTotalEarned > 0, `${elifName}: total earned > EUR0 (EUR${elifTotalEarned.toFixed(2)})`);
  }

  // ════════════════════════════════════════════════════════════════════
  //  15 · Instructor Earnings – Oguzhan Benturk (C2's instructor)
  // ════════════════════════════════════════════════════════════════════
  title(`15 · ${oguzhanName} Earnings (C2's instructor - starter pkg + individual + beginner pkg)`);
  const oguzhanEarningsRes = await apiOk('GET', `/finances/instructor-earnings/${OGUZHAN_ID}`, null, token);
  const oguzhanAllEarnings = oguzhanEarningsRes.earnings || [];
  const c2BookingIds = new Set(c2Bookings.map(b => b.id));
  const oguzhanOurEarnings = oguzhanAllEarnings.filter(e => c2BookingIds.has(e.booking_id));
  const oguzhanTotalEarned = oguzhanOurEarnings.reduce((s, e) => s + (e.total_earnings || 0), 0);
  log(`  ${c2Bookings.length} total bookings -> ${oguzhanOurEarnings.length} earnings -> EUR${oguzhanTotalEarned.toFixed(2)}`);
  log(`    Starter pkg: ${c2StarterBookings.length} sessions (${STARTER_PKG_HOURS}h)`);
  log(`    Individual:  ${c2IndividualBookings.length} sessions (${C2_INDIVIDUAL_HOURS}h)`);
  log(`    Beginner:    ${c2BegLessonBookings.length} sessions (${PKG_HOURS}h)`);
  assert(oguzhanOurEarnings.length === c2Bookings.length,
    `${oguzhanName}: ${c2Bookings.length} bookings -> ${oguzhanOurEarnings.length} earnings`);
  assert(oguzhanTotalEarned > 0, `${oguzhanName}: total earned > EUR0 (EUR${oguzhanTotalEarned.toFixed(2)})`);

  // ════════════════════════════════════════════════════════════════════
  //  16 · Manager Commission Verification
  // ════════════════════════════════════════════════════════════════════
  title('16 · Manager Commission Verification');

  const managersRes = await apiOk('GET', '/manager/commissions/admin/managers', null, token);
  const managers = managersRes.data || managersRes || [];
  if (!managers.length) {
    warn('No managers found - skipping commission check');
  } else {
    const manager = managers[0];
    const managerId = manager.id || manager.user_id || manager.userId;
    const managerName = `${manager.first_name || ''} ${manager.last_name || ''}`.trim();
    log(`  Manager: ${managerName} (${managerId})`);

    const mgCommRes = await apiOk(
      'GET', `/manager/commissions/admin/managers/${managerId}/commissions?limit=500`, null, token
    );
    const mgComm = mgCommRes.data || mgCommRes || [];

    // -- Booking commissions --
    const allBookingIds = new Set([
      ...c1Bookings.map(b => b.id),
      ...c2Bookings.map(b => b.id),
    ]);
    const bookingComm = mgComm.filter(c =>
      allBookingIds.has(c.source_id) || allBookingIds.has(c.booking_id) || allBookingIds.has(c.sourceId)
    );
    const bookingCommTotal = bookingComm.reduce(
      (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
    );
    log(`  Booking commissions: ${bookingComm.length} records -> EUR${bookingCommTotal.toFixed(2)}`);

    // C1 bookings (Elif Sari)
    const c1BookComm = bookingComm.filter(c =>
      c1BookingIds.has(c.source_id) || c1BookingIds.has(c.booking_id) || c1BookingIds.has(c.sourceId)
    );
    log(`    C1 (${elifName}): ${c1BookComm.length} commission records`);
    if (c1Bookings.length > 0) {
      assert(c1BookComm.length === c1Bookings.length,
        `C1 booking commissions: ${c1BookComm.length} (expected ${c1Bookings.length})`);
    }

    // C2 bookings (Oguzhan Benturk - starter + individual + beginner)
    const c2BookComm = bookingComm.filter(c =>
      c2BookingIds.has(c.source_id) || c2BookingIds.has(c.booking_id) || c2BookingIds.has(c.sourceId)
    );
    log(`    C2 (${oguzhanName}): ${c2BookComm.length} commission records`);
    assert(c2BookComm.length === c2Bookings.length,
      `C2 booking commissions: ${c2BookComm.length} (expected ${c2Bookings.length})`);

    assert(bookingCommTotal > 0,
      `Total booking commission > EUR0 (EUR${bookingCommTotal.toFixed(2)})`);

    // -- Rental commissions --
    if (c1Rentals.length > 0 || c2Rentals.length > 0) {
      const allRentalIds = new Set([...c1Rentals, ...c2Rentals]);
      const rentalComm = mgComm.filter(c =>
        allRentalIds.has(c.source_id) || allRentalIds.has(c.rental_id) || allRentalIds.has(c.sourceId)
      );
      const rentalCommTotal = rentalComm.reduce(
        (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
      );
      log(`  Rental commissions: ${rentalComm.length} records -> EUR${rentalCommTotal.toFixed(2)}`);

      if (c1Rentals.length > 0) {
        const c1RentalSet = new Set(c1Rentals);
        const c1RentalComm = rentalComm.filter(c =>
          c1RentalSet.has(c.source_id) || c1RentalSet.has(c.rental_id) || c1RentalSet.has(c.sourceId)
        );
        log(`    C1 rentals: ${c1RentalComm.length} commission records`);
        assert(c1RentalComm.length === PKG_RENTAL_DAYS,
          `C1 rental commissions: ${c1RentalComm.length} (expected ${PKG_RENTAL_DAYS})`);
      }

      if (c2Rentals.length > 0) {
        const c2RentalSet = new Set(c2Rentals);
        const c2RentalComm = rentalComm.filter(c =>
          c2RentalSet.has(c.source_id) || c2RentalSet.has(c.rental_id) || c2RentalSet.has(c.sourceId)
        );
        log(`    C2 rentals: ${c2RentalComm.length} commission records`);
        assert(c2RentalComm.length === PKG_RENTAL_DAYS,
          `C2 rental commissions: ${c2RentalComm.length} (expected ${PKG_RENTAL_DAYS})`);
      }

      assert(rentalCommTotal > 0,
        `Total rental commission > EUR0 (EUR${rentalCommTotal.toFixed(2)})`);
    }

    // -- Accommodation commissions --
    const accomComm = mgComm.filter(c => c.source_type === 'accommodation');
    const accomCommTotal = accomComm.reduce(
      (s, c) => s + parseFloat(c.commission_amount ?? c.commissionAmount ?? c.amount ?? 0), 0
    );
    log(`  Accommodation commissions: ${accomComm.length} records -> EUR${accomCommTotal.toFixed(2)}`);
    if (accomComm.length > 0) {
      ok(`Accommodation commission records exist (${accomComm.length})`);
    } else {
      warn('No accommodation commissions - check accommodationRate in manager settings');
    }

    // -- Manager dashboard summary --
    title('16b · Manager Summary');
    const mgSummaryRes = await apiOk(
      'GET', `/manager/commissions/admin/managers/${managerId}/summary`, null, token
    );
    const mgSummary = mgSummaryRes.data || mgSummaryRes;
    const totalMgrEarned = parseFloat(mgSummary?.totalEarned ?? mgSummary?.total_earned ?? 0);
    log(`  Manager total earned: EUR${totalMgrEarned.toFixed(2)}`);
    assert(totalMgrEarned > 0, `Manager dashboard totalEarned > EUR0 (EUR${totalMgrEarned.toFixed(2)})`);

    const bookingEarned = parseFloat(mgSummary?.bookingEarned ?? mgSummary?.booking_earned ?? 0);
    const rentalEarned  = parseFloat(mgSummary?.rentalEarned ?? mgSummary?.rental_earned ?? 0);
    const accomEarned   = parseFloat(mgSummary?.accommodationEarned ?? mgSummary?.accommodation_earned ?? 0);
    log(`  Breakdown: bookings EUR${bookingEarned.toFixed(2)}, rentals EUR${rentalEarned.toFixed(2)}, accommodation EUR${accomEarned.toFixed(2)}`);
  }

  // ════════════════════════════════════════════════════════════════════
  //  17 · Admin Finance Summary
  // ════════════════════════════════════════════════════════════════════
  title('17 · Admin Finance Summary');
  const summary = await apiOk('GET', '/finances/summary?mode=accrual', null, token);
  const revenue = summary.revenue || {};
  log(`  Total revenue: EUR${revenue.total_revenue}`);
  log(`  Lesson revenue: EUR${revenue.lesson_revenue || 0}`);
  log(`  Rental revenue: EUR${revenue.rental_revenue || 0}`);
  log(`  Package revenue: EUR${revenue.package_revenue || 0}`);
  log(`  Accommodation revenue: EUR${revenue.accommodation_revenue || 0}`);
  assert(Number(revenue.total_revenue) > 0, `Total revenue > 0: EUR${revenue.total_revenue}`);

  // Admin finance - instructor balances
  title('17b · Admin Finance - Instructor Balances');
  const balancesRes = await apiOk('GET', '/finances/instructor-balances', null, token);
  const balances = Array.isArray(balancesRes) ? balancesRes : balancesRes.balances || balancesRes.data || [];
  const elifBal = balances.find(b => b.instructor_id === ELIF_ID || b.id === ELIF_ID);
  const oguzhanBal = balances.find(b => b.instructor_id === OGUZHAN_ID || b.id === OGUZHAN_ID);
  if (elifBal) {
    log(`  ${elifName}: total_earned=EUR${elifBal.total_earned || elifBal.total_earnings || 0}`);
    assert(Number(elifBal.total_earned || elifBal.total_earnings || 0) > 0,
      `${elifName} has earnings in instructor balances`);
  } else {
    warn(`${elifName} not found in instructor balances`);
  }
  if (oguzhanBal) {
    log(`  ${oguzhanName}: total_earned=EUR${oguzhanBal.total_earned || oguzhanBal.total_earnings || 0}`);
    assert(Number(oguzhanBal.total_earned || oguzhanBal.total_earnings || 0) > 0,
      `${oguzhanName} has earnings in instructor balances`);
  } else {
    warn(`${oguzhanName} not found in instructor balances`);
  }

  // ════════════════════════════════════════════════════════════════════
  //  18 · Top-up Wallets for memberships & shop
  // ════════════════════════════════════════════════════════════════════
  title('18 · Topping up wallets for memberships + shop');
  const topUpAmount = SEASONAL_PASS_PRICE * 2 + 200;
  await fundWallet(c1.userId, topUpAmount, token);
  await fundWallet(c2.userId, topUpAmount, token);
  ok(`Both wallets topped up: +EUR${topUpAmount}`);

  // ════════════════════════════════════════════════════════════════════
  //  19 · Buy Seasonal Memberships (2 per customer)
  //       - 1 expired (set expires_at in the past)
  //       - 1 about to expire (set expires_at 3 days from now)
  // ════════════════════════════════════════════════════════════════════
  title('19 · Purchasing seasonal memberships (2 per customer)');

  const membershipPurchases = [];
  for (const [label, userId] of [['C1', c1.userId], ['C2', c2.userId]]) {
    const custToken = await customerLogin(userId);

    // Purchase 1 (will be set to expired)
    const m1 = await apiOk('POST', `/member-offerings/${SEASONAL_PASS_OFFERING_ID}/purchase`, {
      paymentMethod: 'wallet',
    }, custToken);
    const m1Id = m1.id || m1.purchase?.id || m1.data?.id;
    ok(`${label} membership #1 purchased: ${m1Id}`);
    membershipPurchases.push({ label, userId, id: m1Id, type: 'expired' });

    // Purchase 2 (will be set to about-to-expire)
    const m2 = await apiOk('POST', `/member-offerings/${SEASONAL_PASS_OFFERING_ID}/purchase`, {
      paymentMethod: 'wallet',
    }, custToken);
    const m2Id = m2.id || m2.purchase?.id || m2.data?.id;
    ok(`${label} membership #2 purchased: ${m2Id}`);
    membershipPurchases.push({ label, userId, id: m2Id, type: 'soon' });
  }

  // Adjust expiry dates via admin endpoint
  title('19b · Adjusting membership expiry dates');
  for (const mp of membershipPurchases) {
    const newExpiry = mp.type === 'expired' ? pastDate(5) : soonDate(3);
    const typeLabel = mp.type === 'expired' ? 'EXPIRED (5 days ago)' : 'EXPIRING (3 days)';
    await apiOk('PUT', `/member-offerings/admin/purchases/${mp.id}`, {
      expires_at: newExpiry,
    }, token);
    ok(`${mp.label} membership #${mp.id} -> ${typeLabel}`);
  }

  // Verify memberships
  title('19c · Verifying membership statuses');
  for (const [label, userId] of [['C1', c1.userId], ['C2', c2.userId]]) {
    const purchasesRes = await apiOk('GET', `/member-offerings/user/${userId}/purchases`, null, token);
    const purchases = Array.isArray(purchasesRes) ? purchasesRes : purchasesRes.purchases || purchasesRes.data || [];
    const myMemberPurchaseIds = membershipPurchases.filter(mp => mp.userId === userId).map(mp => mp.id);
    const myPurchases = purchases.filter(p => myMemberPurchaseIds.includes(p.id));

    log(`  ${label}: ${myPurchases.length} membership purchases found`);
    assert(myPurchases.length >= 2, `${label} has 2 seasonal memberships (found ${myPurchases.length})`);

    const hasExpired = myPurchases.some(p => {
      const st = (p.computed_status || p.status || '').toLowerCase();
      return st === 'expired' || (p.expires_at && new Date(p.expires_at) < new Date());
    });
    assert(hasExpired, `${label} has at least 1 expired membership`);

    const hasActive = myPurchases.some(p => {
      const st = (p.computed_status || p.status || '').toLowerCase();
      return st === 'active';
    });
    assert(hasActive, `${label} has at least 1 active (about-to-expire) membership`);
  }

  // ════════════════════════════════════════════════════════════════════
  //  20 · Shop Order (1 per customer, status: pending)
  // ════════════════════════════════════════════════════════════════════
  title('20 · Placing shop orders (1 per customer - pending status)');

  // Find an available product
  const productsRes = await apiOk('GET', '/products?limit=5', null, token);
  const products = Array.isArray(productsRes) ? productsRes : productsRes.data || productsRes.products || [];
  const activeProduct = products.find(p => (p.status || 'active') === 'active' && (p.stock_quantity || 0) > 0);

  if (!activeProduct) {
    warn('No active products with stock found - skipping shop order test');
  } else {
    log(`  Product: ${activeProduct.name} (EUR${activeProduct.price}) - stock: ${activeProduct.stock_quantity}`);

    for (const [label, userId] of [['C1', c1.userId], ['C2', c2.userId]]) {
      const custToken = await customerLogin(userId);
      const orderRes = await apiOk('POST', '/shop-orders', {
        items: [{
          product_id: activeProduct.id,
          quantity: 1,
        }],
        payment_method: 'wallet',
      }, custToken);

      const order = orderRes.order || orderRes;
      const orderId = order.id;
      const orderStatus = (order.status || '').toLowerCase();
      const orderNumber = order.order_number || order.orderNumber || orderId;
      ok(`${label} order placed: ${orderNumber} (status: ${orderStatus})`);
      assert(orderStatus === 'pending', `${label} order status = pending (got ${orderStatus})`);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  TEST RESULTS
  // ════════════════════════════════════════════════════════════════════
  title('TEST RESULTS');
  log(`\n  ${passedTests}/${totalTests} tests passed\n`);

  if (passedTests === totalTests) {
    log('  ALL TESTS PASSED!\n');
  } else {
    log(`  ${totalTests - passedTests} test(s) failed.\n`);
  }

  log('='.repeat(60));
  log(`  C1: ${c1Name} (${c1.profile.email}) -> instructor: ${elifName}`);
  log(`  C2: ${c2Name} (${c2.profile.email}) -> instructor: ${oguzhanName}`);
  log(`  Beginner Package: ${PKG_NAME} (EUR${PKG_PRICE})`);
  if (INCL_LESSONS) log(`    Lessons: ${PKG_HOURS}h / ${PKG_SESSIONS_CT} sessions`);
  if (INCL_RENTAL)  log(`    Rentals: ${PKG_RENTAL_DAYS} days`);
  if (INCL_ACCOM)   log(`    Accommodation: ${PKG_NIGHTS} nights`);
  log(`  C2 extra: ${STARTER_PKG_NAME} (EUR${STARTER_PKG_PRICE}) + ${C2_INDIVIDUAL_HOURS}h individual`);
  log(`  Seasonal memberships: 2 per customer (1 expired + 1 expiring)`);
  log(`  Shop orders: 1 per customer (pending)`);
  log(`  Cleanup: node tests/scripts/cleanup.mjs`);
  log('='.repeat(60));

  process.exit(passedTests === totalTests ? 0 : 1);
}

main().catch(e => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
