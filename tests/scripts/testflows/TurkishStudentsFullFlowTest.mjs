#!/usr/bin/env node
/**
 * Turkish Students Full-Flow Test
 *
 * Creates 2 Turkish students with realistic, end-to-end booking/purchasing flows.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ SHARED: Both students buy Semi-Private Beginner Pack (€550 each, 10h)      │
 * │         → 6 semi-private group sessions with Elif Sarı                     │
 * │         → Random hour blocks: [2, 1.5, 1, 2, 1.5, 2] = 10h               │
 * │                                                                            │
 * │ S1 Emre  : All Inclusive Beginner Package (€1930)                          │
 * │            → 6 lessons (2h each) with Elif (mornings)                      │
 * │            → 7 rental days (afternoons)                                    │
 * │            → 8 accommodation nights                                        │
 * │            + Shop: Duotone Rebel D/LAB — 2 sizes (5m, 7m), 2 colors       │
 * │            + Event: Deneme Event (€15)                                     │
 * │            + Membership: DPC-Urla Weekly (€60)                             │
 * │            + Kite repair request                                           │
 * │                                                                            │
 * │ S2 Selin : 1 Week SLS Rental Package (€420) + 8h Rider Pack (€600)        │
 * │            → 5 private lessons with Oğuzhan Bentürk                        │
 * │            → 7 rental days (package)                                       │
 * │            + Shop: Ion Wetsuit — 2 sizes (M, L)                            │
 * │            + Event: Deneme Event (€15)                                     │
 * │            + Membership: DPC-Urla Seasonal (€300)                          │
 * │            + Kite repair request                                           │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * Usage:   node tests/scripts/testflows/TurkishStudentsFullFlowTest.mjs
 * Reset:   node tests/scripts/db-reset.mjs --execute
 * Cleanup: node tests/scripts/cleanup.mjs
 */

import {
  API, PASSWORD, ADMIN_EMAIL, TURKISH_PROFILES,
  // Semi-Private Beginner Pack
  SEMI_PRIVATE_PKG_ID, SEMI_PRIVATE_PKG_NAME, SEMI_PRIVATE_PKG_PRICE,
  SEMI_PRIVATE_PKG_HOURS, SEMI_PRIVATE_LESSON_SERVICE_ID,
  SEMI_PRIVATE_LESSON_PRICE,
  // All Inclusive Beginner Package
  ALL_INCLUSIVE_PKG_ID, ALL_INCLUSIVE_PKG_NAME, ALL_INCLUSIVE_PKG_PRICE,
  ALL_INCLUSIVE_PKG_HOURS, ALL_INCLUSIVE_PKG_RENTAL_DAYS, ALL_INCLUSIVE_PKG_NIGHTS,
  ALL_INCLUSIVE_LESSON_SERVICE_ID, ALL_INCLUSIVE_RENTAL_SERVICE_ID,
  // SLS Rental Package
  SLS_RENTAL_PKG_ID, SLS_RENTAL_PKG_NAME, SLS_RENTAL_PKG_PRICE, SLS_RENTAL_PKG_DAYS,
  SLS_EQUIPMENT_SERVICE_ID,
  // Private lesson
  PRIVATE_LESSON_SERVICE_ID, PRIVATE_LESSON_PRICE,
  // Accommodation
  ACCOMMODATION_UNIT_ID,
  // Instructors
  ELIF_ID, OGUZHAN_ID,
  // Helpers
  log, ok, fail, title, api, apiOk, adminLogin,
} from '../_shared.mjs';

// ── New constants (not in _shared.mjs) ─────────────────────────────
const RIDER_PACK_8H_ID    = '22af8b3d-087a-4198-b2bd-7efb7689aae7';
const RIDER_PACK_8H_NAME  = '8h – Rider Pack';
const RIDER_PACK_8H_PRICE = 600;
const RIDER_PACK_8H_HOURS = 8;

// Products
const REBEL_DLAB_ID  = '65f2d889-f097-4c08-9bb1-2cfc5f71cb73';
const WETSUIT_ID     = '53c3229e-e4b9-42b5-a978-8eeb08f5f39d';

// Event
const EVENT_ID = '8a1f07ab-8279-47f0-ab81-0806e0b1064c'; // Deneme Event, €15

// Member offerings
const WEEKLY_MEMBERSHIP_ID   = 11;  // DPC-Urla Weekly, €60
const SEASONAL_MEMBERSHIP_ID = 13;  // DPC-Urla Seasonal, €300

// ── Session schedules ──────────────────────────────────────────────
const SEMI_PRIVATE_SESSIONS  = [2, 1.5, 1, 2, 1.5, 2];           // 10h total (6 sessions)
const ALL_INCLUSIVE_SESSIONS = [2, 2, 2, 2, 2, 2];                // 12h total (6 sessions)
const RIDER_PACK_SESSIONS    = [2, 1.5, 1.5, 1, 2];              //  8h total (5 sessions)

// ── Wallet funding ─────────────────────────────────────────────────
const EMRE_WALLET  = 10000; // €550 semi + €1930 all-incl + €6100 shop + €15 event + €60 membership
const SELIN_WALLET = 5000;  // €550 semi + €420 rental + €600 rider + €290 shop + €15 event + €300 membership

// ── Student profiles ───────────────────────────────────────────────
const EMRE_PROFILE = {
  ...TURKISH_PROFILES.find(p => p.first_name === 'Emre'),
  address: 'Bağdat Caddesi No:142/A Kadıköy',
  postal_code: '34710',
};
const SELIN_PROFILE = {
  ...TURKISH_PROFILES.find(p => p.first_name === 'Selin'),
  address: 'Kordon Boyu Mah. Atatürk Cad. No:88',
  postal_code: '35210',
};

// ── Date helpers ───────────────────────────────────────────────────
function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// ── Helpers ────────────────────────────────────────────────────────
async function createStudent(profile, roleId, token) {
  const res = await api('POST', '/users', { ...profile, password: PASSWORD, role_id: roleId }, token);
  if (res.ok) {
    const userId = res.data.id || res.data.user?.id;
    return userId;
  }
  if (res.status === 409) {
    // Already exists — look up by email
    const usersRes = await apiOk('GET', `/users?search=${encodeURIComponent(profile.email)}`, null, token);
    const users = Array.isArray(usersRes) ? usersRes : usersRes.users || usersRes.data || [];
    const found = users.find(u => u.email === profile.email);
    if (found) return found.id;
    throw new Error(`User ${profile.email} exists but could not look up ID`);
  }
  throw new Error(`POST /users → ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
}

async function fundWallet(userId, amount, token) {
  await apiOk('POST', '/wallet/manual-adjust', {
    userId, amount, currency: 'EUR', description: 'Turkish students test funding',
  }, token);
}

async function customerLogin(email) {
  const { token } = await apiOk('POST', '/auth/login', { email, password: PASSWORD });
  return token;
}

async function getWalletBalance(userId, token) {
  const acct = await apiOk('GET', `/finances/accounts/${userId}`, null, token);
  return parseFloat(acct.balance ?? acct.wallet?.balance ?? 0);
}

// ════════════════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════════════════
(async () => {
  try {
    // ── Phase 1: Admin login & setup ───────────────────────────
    title('Phase 1 · Admin Login & Setup');

    const token = await adminLogin();
    ok('Admin logged in');

    const roles = await apiOk('GET', '/roles', null, token);
    const studentRole = (Array.isArray(roles) ? roles : roles.roles || []).find(r => r.name === 'student');
    if (!studentRole) throw new Error('Student role not found');
    ok(`Student role: ${studentRole.id}`);

    // ── Phase 2: Create students & fund wallets ────────────────
    title('Phase 2 · Create Students & Fund Wallets');

    const emreId = await createStudent(EMRE_PROFILE, studentRole.id, token);
    ok(`S1 Emre Yılmaz → ${emreId}`);

    const selinId = await createStudent(SELIN_PROFILE, studentRole.id, token);
    ok(`S2 Selin Kaya  → ${selinId}`);

    await fundWallet(emreId, EMRE_WALLET, token);
    const emreBal = await getWalletBalance(emreId, token);
    ok(`S1 wallet: €${emreBal}`);

    await fundWallet(selinId, SELIN_WALLET, token);
    const selinBal = await getWalletBalance(selinId, token);
    ok(`S2 wallet: €${selinBal}`);

    const emreToken = await customerLogin(EMRE_PROFILE.email);
    const selinToken = await customerLogin(SELIN_PROFILE.email);
    ok('Both students logged in');

    // ── Phase 3: Semi-Private Beginner Pack (shared) ───────────
    title('Phase 3 · Semi-Private Beginner Pack (€550 each, 10h)');

    // Both students purchase the package
    const emreSemiPkg = await apiOk('POST', '/services/customer-packages', {
      customerId: emreId,
      servicePackageId: SEMI_PRIVATE_PKG_ID,
      packageName: SEMI_PRIVATE_PKG_NAME,
      totalHours: SEMI_PRIVATE_PKG_HOURS,
      purchasePrice: SEMI_PRIVATE_PKG_PRICE,
      currency: 'EUR',
      includesLessons: true,
      includesRental: false,
      includesAccommodation: false,
      packageType: 'lesson',
      lessonServiceName: 'Semi Private Kitesurfing Lesson',
    }, token);
    const emreSemiCpId = emreSemiPkg.id;
    ok(`S1 Semi-Private package: ${emreSemiCpId}`);

    const selinSemiPkg = await apiOk('POST', '/services/customer-packages', {
      customerId: selinId,
      servicePackageId: SEMI_PRIVATE_PKG_ID,
      packageName: SEMI_PRIVATE_PKG_NAME,
      totalHours: SEMI_PRIVATE_PKG_HOURS,
      purchasePrice: SEMI_PRIVATE_PKG_PRICE,
      currency: 'EUR',
      includesLessons: true,
      includesRental: false,
      includesAccommodation: false,
      packageType: 'lesson',
      lessonServiceName: 'Semi Private Kitesurfing Lesson',
    }, token);
    const selinSemiCpId = selinSemiPkg.id;
    ok(`S2 Semi-Private package: ${selinSemiCpId}`);

    // Book 6 semi-private group sessions with Elif
    log('  Booking semi-private sessions with Elif...');
    const semiBookingIds = [];
    let dayOffset = 3; // start 3 days from now

    for (let i = 0; i < SEMI_PRIVATE_SESSIONS.length; i++) {
      const duration = SEMI_PRIVATE_SESSIONS[i];
      const dateStr = futureDate(dayOffset);
      const startHour = `${9 + (i % 4)}.00`; // stagger start times

      const groupRes = await apiOk('POST', '/bookings/group', {
        date: dateStr,
        start_hour: startHour,
        duration,
        instructor_user_id: ELIF_ID,
        service_id: SEMI_PRIVATE_LESSON_SERVICE_ID,
        status: 'confirmed',
        participants: [
          {
            userId: emreId,
            userName: `${EMRE_PROFILE.first_name} ${EMRE_PROFILE.last_name}`,
            isPrimary: true,
            usePackage: true,
            customerPackageId: emreSemiCpId,
            paymentStatus: 'package',
            paymentAmount: 0,
          },
          {
            userId: selinId,
            userName: `${SELIN_PROFILE.first_name} ${SELIN_PROFILE.last_name}`,
            isPrimary: false,
            usePackage: true,
            customerPackageId: selinSemiCpId,
            paymentStatus: 'package',
            paymentAmount: 0,
          },
        ],
      }, token);

      const bId = groupRes.id || groupRes.booking?.id || (groupRes.bookings && groupRes.bookings[0]?.id);
      semiBookingIds.push(bId);
      ok(`  Session ${i + 1}: ${duration}h on ${dateStr} at ${startHour} → ${bId}`);

      dayOffset += 2 + Math.floor(Math.random() * 3); // 2-4 days apart
    }

    // Complete all semi-private sessions
    for (const bId of semiBookingIds) {
      if (bId) await apiOk('PUT', `/bookings/${bId}`, { status: 'completed' }, token);
    }
    ok(`All ${semiBookingIds.length} semi-private sessions completed (10h total)`);

    // ── Phase 4: S1 Emre — All Inclusive Beginner Package ──────
    title('Phase 4 · S1 Emre — All Inclusive Beginner Package (€1930)');

    const emreAllIncPkg = await apiOk('POST', '/services/customer-packages', {
      customerId: emreId,
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
    const emreAllIncCpId = emreAllIncPkg.id;
    ok(`All Inclusive purchased: ${emreAllIncCpId}`);

    // 6 × 2h morning lessons with Elif
    log('  Booking 6 morning lessons (2h each) with Elif...');
    const allIncBookingIds = [];
    let lessonDay = 30; // start ~1 month from now

    for (let i = 0; i < ALL_INCLUSIVE_SESSIONS.length; i++) {
      const duration = ALL_INCLUSIVE_SESSIONS[i];
      const dateStr = futureDate(lessonDay + i);
      const booking = await apiOk('POST', '/bookings?force=true', {
        date: dateStr,
        start_hour: '9.00', // mornings
        duration,
        student_user_id: emreId,
        instructor_user_id: ELIF_ID,
        service_id: ALL_INCLUSIVE_LESSON_SERVICE_ID,
        status: 'confirmed',
        use_package: true,
        customer_package_id: emreAllIncCpId,
      }, token);
      const bId = booking.id || booking.booking?.id;
      allIncBookingIds.push(bId);
    }

    // Complete lessons
    for (const bId of allIncBookingIds) {
      await apiOk('PUT', `/bookings/${bId}`, { status: 'completed' }, token);
    }
    ok(`6 morning lessons completed (${ALL_INCLUSIVE_PKG_HOURS}h)`);

    // 7 afternoon rental days (package)
    log('  Creating 7 afternoon rental days...');
    for (let i = 0; i < ALL_INCLUSIVE_PKG_RENTAL_DAYS; i++) {
      const startDate = futureDate(lessonDay + i);
      const endDate = futureDate(lessonDay + i + 1);
      const rental = await apiOk('POST', '/rentals', {
        user_id: emreId,
        equipment_ids: [ALL_INCLUSIVE_RENTAL_SERVICE_ID],
        rental_days: 1,
        start_date: startDate,
        end_date: endDate,
        use_package: true,
        customer_package_id: emreAllIncCpId,
        payment_method: 'wallet',
      }, token);
      const rId = rental.id || rental.rental?.id;
      try { await apiOk('PATCH', `/rentals/${rId}/activate`, null, token); } catch { /* ok */ }
      await apiOk('PATCH', `/rentals/${rId}/complete`, null, token);
    }
    ok(`7 rental days completed`);

    // 8 accommodation nights
    log('  Consuming 8 accommodation nights...');
    try {
      await apiOk('POST', `/services/customer-packages/${emreAllIncCpId}/use-accommodation-nights`, {
        nightsToUse: ALL_INCLUSIVE_PKG_NIGHTS,
        checkInDate: futureDate(lessonDay),
      }, token);
      ok(`8 accommodation nights consumed from package`);
    } catch (e) {
      log(`  ⚠️  Accommodation endpoint: ${e.message}`);
      try {
        await apiOk('PUT', `/services/customer-packages/${emreAllIncCpId}`, {
          accommodation_nights_used: ALL_INCLUSIVE_PKG_NIGHTS,
          accommodation_nights_remaining: 0,
        }, token);
        ok('  Accommodation nights updated via PUT');
      } catch (e2) {
        log(`  ⚠️  Could not consume accommodation: ${e2.message}`);
      }
    }

    // ── Phase 5: S2 Selin — 1 Week SLS Rental + 8h Rider Pack ─
    title('Phase 5 · S2 Selin — SLS Rental (€420) + 8h Rider Pack (€600)');

    // Purchase 1 Week SLS Rental Package
    const selinRentalPkg = await apiOk('POST', '/services/customer-packages', {
      customerId: selinId,
      servicePackageId: SLS_RENTAL_PKG_ID,
      packageName: SLS_RENTAL_PKG_NAME,
      purchasePrice: SLS_RENTAL_PKG_PRICE,
      currency: 'EUR',
      totalHours: 0,
      includesLessons: false,
      includesRental: true,
      includesAccommodation: false,
      packageType: 'rental',
      rentalDays: SLS_RENTAL_PKG_DAYS,
    }, token);
    const selinRentalCpId = selinRentalPkg.id;
    ok(`SLS Rental package: ${selinRentalCpId}`);

    // 7 rental days from package
    log('  Creating 7 rental days from package...');
    let rentalDay = 35;
    for (let i = 0; i < SLS_RENTAL_PKG_DAYS; i++) {
      const startDate = futureDate(rentalDay + i);
      const endDate = futureDate(rentalDay + i + 1);
      const rental = await apiOk('POST', '/rentals', {
        user_id: selinId,
        equipment_ids: [SLS_EQUIPMENT_SERVICE_ID],
        rental_days: 1,
        start_date: startDate,
        end_date: endDate,
        use_package: true,
        customer_package_id: selinRentalCpId,
        payment_method: 'wallet',
      }, token);
      const rId = rental.id || rental.rental?.id;
      try { await apiOk('PATCH', `/rentals/${rId}/activate`, null, token); } catch { /* ok */ }
      await apiOk('PATCH', `/rentals/${rId}/complete`, null, token);
    }
    ok('7 rental days completed');

    // Purchase 8h Rider Pack
    const selinRiderPkg = await apiOk('POST', '/services/customer-packages', {
      customerId: selinId,
      servicePackageId: RIDER_PACK_8H_ID,
      packageName: RIDER_PACK_8H_NAME,
      totalHours: RIDER_PACK_8H_HOURS,
      purchasePrice: RIDER_PACK_8H_PRICE,
      currency: 'EUR',
      includesLessons: true,
      includesRental: false,
      includesAccommodation: false,
      packageType: 'lesson',
      lessonServiceName: 'Private Kitesurfing Lesson',
    }, token);
    const selinRiderCpId = selinRiderPkg.id;
    ok(`8h Rider Pack: ${selinRiderCpId}`);

    // 5 private lessons with Oğuzhan
    log('  Booking 5 private lessons with Oğuzhan...');
    const riderBookingIds = [];
    let riderDay = 40;

    for (let i = 0; i < RIDER_PACK_SESSIONS.length; i++) {
      const duration = RIDER_PACK_SESSIONS[i];
      const dateStr = futureDate(riderDay + i * 2);
      const booking = await apiOk('POST', '/bookings?force=true', {
        date: dateStr,
        start_hour: `${10 + i}.00`,
        duration,
        student_user_id: selinId,
        instructor_user_id: OGUZHAN_ID,
        service_id: PRIVATE_LESSON_SERVICE_ID,
        status: 'confirmed',
        use_package: true,
        customer_package_id: selinRiderCpId,
      }, token);
      const bId = booking.id || booking.booking?.id;
      riderBookingIds.push(bId);
    }

    for (const bId of riderBookingIds) {
      await apiOk('PUT', `/bookings/${bId}`, { status: 'completed' }, token);
    }
    ok(`5 private lessons completed (${RIDER_PACK_8H_HOURS}h) with Oğuzhan`);

    // ── Phase 6: Shop purchases ────────────────────────────────
    title('Phase 6 · Shop Purchases');

    // S1 Emre — Duotone Rebel D/LAB (2 sizes, 2 colors)
    log('  S1 placing shop order: Duotone Rebel D/LAB...');
    const emreOrder = await apiOk('POST', '/shop-orders', {
      items: [
        {
          product_id: REBEL_DLAB_ID,
          quantity: 1,
          selected_size: '5m',
          selected_color: 'Grey',
          selected_variant: { label: '5m', price: 3000 },
        },
        {
          product_id: REBEL_DLAB_ID,
          quantity: 1,
          selected_size: '7m',
          selected_color: 'Yellow',
          selected_variant: { label: '7m', price: 3100 },
        },
      ],
      payment_method: 'wallet',
      shipping_address: EMRE_PROFILE.address + ', ' + EMRE_PROFILE.city + ' ' + EMRE_PROFILE.postal_code,
      notes: 'Emre test order — 2 kites, different sizes & colors',
    }, emreToken);
    ok(`S1 shop order: ${(emreOrder.order || emreOrder).id} — Rebel D/LAB (5m Grey + 7m Yellow)`);

    // S2 Selin — Ion Wetsuit (2 sizes)
    log('  S2 placing shop order: Ion Wetsuit...');
    const selinOrder = await apiOk('POST', '/shop-orders', {
      items: [
        {
          product_id: WETSUIT_ID,
          quantity: 1,
          selected_size: 'M',
          selected_variant: { label: 'M', price: 145 },
        },
        {
          product_id: WETSUIT_ID,
          quantity: 1,
          selected_size: 'L',
          selected_variant: { label: 'L', price: 145 },
        },
      ],
      payment_method: 'wallet',
      shipping_address: SELIN_PROFILE.address + ', ' + SELIN_PROFILE.city + ' ' + SELIN_PROFILE.postal_code,
      notes: 'Selin test order — 2 wetsuits, different sizes',
    }, selinToken);
    ok(`S2 shop order: ${(selinOrder.order || selinOrder).id} — Wetsuit (M + L)`);

    // ── Phase 7: Event registration ────────────────────────────
    title('Phase 7 · Event Registration');

    const emreEventRes = await apiOk('POST', `/events/${EVENT_ID}/register`, null, emreToken);
    ok(`S1 registered for event: ${emreEventRes.id || 'ok'}`);

    const selinEventRes = await apiOk('POST', `/events/${EVENT_ID}/register`, null, selinToken);
    ok(`S2 registered for event: ${selinEventRes.id || 'ok'}`);

    // ── Phase 8: Membership purchases ──────────────────────────
    title('Phase 8 · Membership Purchases');

    // S1 — Weekly DPC-Urla (€60)
    const emreMembership = await apiOk('POST', `/member-offerings/${WEEKLY_MEMBERSHIP_ID}/purchase`, {
      paymentMethod: 'wallet',
    }, emreToken);
    ok(`S1 membership (Weekly): ${emreMembership.id || emreMembership.purchase?.id || 'ok'}`);

    // S2 — Seasonal DPC-Urla (€300)
    const selinMembership = await apiOk('POST', `/member-offerings/${SEASONAL_MEMBERSHIP_ID}/purchase`, {
      paymentMethod: 'wallet',
    }, selinToken);
    ok(`S2 membership (Seasonal): ${selinMembership.id || selinMembership.purchase?.id || 'ok'}`);

    // ── Phase 9: Kite repair requests ──────────────────────────
    title('Phase 9 · Kite Repair Requests');

    // S1 — repair request (authenticated)
    const emreRepair = await apiOk('POST', '/repair-requests', {
      equipmentType: 'kite',
      itemName: 'Duotone Rebel 9m',
      description: 'Broken leading edge bladder — leaking air after hard crash landing. Needs bladder replacement and canopy patch near the 2nd strut.',
      priority: 'high',
    }, emreToken);
    ok(`S1 repair request: ${emreRepair.data?.id || emreRepair.id || 'ok'}`);

    // S2 — repair request (authenticated)
    const selinRepair = await apiOk('POST', '/repair-requests', {
      equipmentType: 'kite',
      itemName: 'Core XR7 12m',
      description: 'Torn canopy near the center strut, approximately 15cm tear. Also the depower line shows signs of wear and should be inspected.',
      priority: 'medium',
    }, selinToken);
    ok(`S2 repair request: ${selinRepair.data?.id || selinRepair.id || 'ok'}`);

    // ── Phase 10: Final balances ───────────────────────────────
    title('Phase 10 · Final Wallet Balances');

    const emreFinal = await getWalletBalance(emreId, token);
    const selinFinal = await getWalletBalance(selinId, token);

    log(`  S1 Emre  — Started: €${EMRE_WALLET} → Remaining: €${emreFinal.toFixed(2)}`);
    log(`  S2 Selin — Started: €${SELIN_WALLET} → Remaining: €${selinFinal.toFixed(2)}`);

    // Summary of expected deductions
    log('\n  Expected S1 deductions:');
    log(`    Semi-Private Pack:       €${SEMI_PRIVATE_PKG_PRICE}`);
    log(`    All Inclusive Pack:      €${ALL_INCLUSIVE_PKG_PRICE}`);
    log(`    Shop (Rebel D/LAB):      €${3000 + 3100}`);
    log(`    Event:                   €15`);
    log(`    Membership (Weekly):     €60`);
    log(`    Total expected:          €${SEMI_PRIVATE_PKG_PRICE + ALL_INCLUSIVE_PKG_PRICE + 6100 + 15 + 60}`);

    log('\n  Expected S2 deductions:');
    log(`    Semi-Private Pack:       €${SEMI_PRIVATE_PKG_PRICE}`);
    log(`    SLS Rental Pack:         €${SLS_RENTAL_PKG_PRICE}`);
    log(`    8h Rider Pack:           €${RIDER_PACK_8H_PRICE}`);
    log(`    Shop (Wetsuit ×2):       €${145 * 2}`);
    log(`    Event:                   €15`);
    log(`    Membership (Seasonal):   €300`);
    log(`    Total expected:          €${SEMI_PRIVATE_PKG_PRICE + SLS_RENTAL_PKG_PRICE + RIDER_PACK_8H_PRICE + 145 * 2 + 15 + 300}`);

    // ── Done ───────────────────────────────────────────────────
    title('✅ ALL DONE — Turkish Students Full Flow Test Complete');
    log(`  2 students created, packages purchased, lessons booked & completed,`);
    log(`  rentals activated, shop orders placed, events registered,`);
    log(`  memberships purchased, repair requests submitted.\n`);

  } catch (err) {
    fail(`FATAL: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
})();
