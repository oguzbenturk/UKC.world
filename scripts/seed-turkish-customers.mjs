/**
 * Seed Script: 50 Turkish Customers with Packages, Lessons & Rentals
 *
 * Usage:  node scripts/seed-turkish-customers.mjs
 *
 * What it does:
 *  1. Logs in as admin
 *  2. Fetches available services, equipment, instructors
 *  3. Creates 50 unique Turkish customers (student role)
 *  4. Funds each customer's wallet
 *  5. 20 customers get a 10-hour private lesson package assigned
 *  6. 10 of those complete all 10 hours (bookings marked completed)
 *  7. 15 customers book individual private lessons (pay per lesson)
 *  8. 15 customers get standard equipment rentals
 *
 * Outputs:  scripts/seed-manifest.json  (used by rollback script)
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(__dirname, 'seed-manifest.json');
const API = process.env.API_URL || 'http://localhost:4000/api';

// Manifest: tracks every created entity so rollback can undo it
const manifest = {
  createdAt: new Date().toISOString(),
  createdPackageDefinition: null,   // service_package id (if we created one)
  createdRentalService: null,       // service id (if we created one)
  userIds: [],
  customerPackageIds: [],
  bookingIds: [],
  rentalIds: [],
};

function saveManifest() {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

// ─── Turkish data pools ────────────────────────────────────────────
const FIRST_NAMES_M = [
  'Ahmet', 'Mehmet', 'Mustafa', 'Ali', 'Hüseyin', 'Hasan', 'İbrahim',
  'Emre', 'Oğuz', 'Burak', 'Serkan', 'Murat', 'Cem', 'Tolga', 'Kaan',
  'Barış', 'Deniz', 'Efe', 'Onur', 'Yusuf', 'Koray', 'Volkan', 'Tuna',
  'Berk', 'Arda',
];
const FIRST_NAMES_F = [
  'Ayşe', 'Fatma', 'Elif', 'Zeynep', 'Merve', 'Esra', 'Selin', 'Melis',
  'Gizem', 'Derya', 'Ceren', 'Pınar', 'Ece', 'Buse', 'Seda', 'Damla',
  'İrem', 'Cansu', 'Hazal', 'Aslı', 'Defne', 'Naz', 'Yağmur', 'Sevgi',
  'Duygu',
];
const LAST_NAMES = [
  'Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Aydın', 'Özdemir',
  'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Korkmaz', 'Öztürk',
  'Yıldız', 'Özkan', 'Güneş', 'Polat', 'Kurt', 'Erdem', 'Aktaş',
  'Taş', 'Koç', 'Karaca', 'Uçar', 'Acar', 'Ergün', 'Bayrak', 'Tunç',
  'Sönmez',
];
const CITIES = [
  'İstanbul', 'Ankara', 'İzmir', 'Antalya', 'Bursa', 'Muğla',
  'Mersin', 'Aydın', 'Bodrum', 'Çeşme', 'Alaçatı', 'Fethiye',
];
const PHONE_PREFIXES = [
  '530', '531', '532', '533', '534', '535', '536', '537', '538', '539',
  '540', '541', '542', '543', '544', '545', '546', '505', '506', '507',
];

// ─── Helpers ───────────────────────────────────────────────────────
const rng = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rngInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const turkishToAscii = (s) =>
  (s || '').toLowerCase().replace(/[İıçşğüöÇŞĞÜÖ]/g, (c) => {
    const map = { 'İ':'i','ı':'i','ç':'c','ş':'s','ğ':'g','ü':'u','ö':'o',
                  'Ç':'c','Ş':'s','Ğ':'g','Ü':'u','Ö':'o' };
    return map[c] || c;
  });

function generatePhone() {
  return `+90${rng(PHONE_PREFIXES)}${String(rngInt(1000000, 9999999))}`;
}

function generateDOB() {
  const y = rngInt(1975, 2004);
  const m = String(rngInt(1, 12)).padStart(2, '0');
  const d = String(rngInt(1, 28)).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const usedEmails = new Set();
function generateCustomer(index) {
  const isFemale = index % 2 === 0;
  const firstName = rng(isFemale ? FIRST_NAMES_F : FIRST_NAMES_M);
  const lastName = rng(LAST_NAMES);
  let email;
  do {
    const n = rngInt(10, 999);
    email = `${turkishToAscii(firstName)}.${turkishToAscii(lastName)}${n}@gmail.com`;
  } while (usedEmails.has(email));
  usedEmails.add(email);

  return {
    first_name: firstName,
    last_name: lastName,
    email,
    phone: generatePhone(),
    password: 'TestPass1!',
    role_id: null, // filled later
    date_of_birth: generateDOB(),
    weight: rngInt(55, 95),
    preferred_currency: 'TRY',
    city: rng(CITIES),
    country: 'Turkey',
  };
}

// ─── API helpers ───────────────────────────────────────────────────
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

  if (!res.ok) {
    const msg = typeof data === 'object' ? (data.message || data.error || JSON.stringify(data)) : text;
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return data;
}

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Seed: 50 Turkish customers with packages, lessons & rentals\n');

  // ── Step 1: Admin login ──
  console.log('1️⃣  Logging in as admin...');
  const loginRes = await api('POST', '/auth/login', {
    email: 'admin@plannivo.com',
    password: 'asdasd35',
  });
  const token = loginRes.token;
  console.log(`   ✅ Logged in as ${loginRes.user?.name || loginRes.user?.email}\n`);

  // ── Step 2: Fetch lookup data ──
  console.log('2️⃣  Fetching services, roles & instructors...');

  const roles = await api('GET', '/roles', null, token);
  const studentRole = (Array.isArray(roles) ? roles : roles.roles || [])
    .find(r => r.name === 'student');
  if (!studentRole) throw new Error('Student role not found');
  const studentRoleId = studentRole.id;
  console.log(`   Student role: ${studentRoleId}`);

  const services = await api('GET', '/services', null, token);
  const allServices = Array.isArray(services) ? services : services.services || [];
  const privateLessons = allServices.filter(s =>
    s.service_type === 'private' || s.lesson_type === 'private' || (s.name || '').toLowerCase().includes('private')
  );
  const lessonServices = privateLessons.length > 0 ? privateLessons : allServices.filter(s =>
    !s.service_type?.includes('rental') && s.category !== 'rental' && s.category !== 'rentals'
  );
  console.log(`   Lesson services: ${lessonServices.map(s => s.name).join(', ') || '(none)'}`);

  const rentalServices = allServices.filter(s =>
    s.service_type === 'rental' || s.category === 'rental' || s.category === 'rentals'
  );
  console.log(`   Rental services: ${rentalServices.length}`);

  const pkgRes = await api('GET', '/services?isPackage=true', null, token);
  const allPackages = Array.isArray(pkgRes) ? pkgRes : pkgRes.services || pkgRes.packages || [];
  console.log(`   Packages: ${allPackages.length}`);

  const usersRes = await api('GET', '/users?role=instructor&limit=50', null, token);
  const instructors = (Array.isArray(usersRes) ? usersRes : usersRes.users || [])
    .filter(u => u.role === 'instructor' || u.role_name === 'instructor');
  console.log(`   Instructors: ${instructors.map(i => i.name || `${i.first_name} ${i.last_name}`).join(', ')}\n`);

  // ── Step 3: Ensure a 10-hour private lesson package exists ──
  let tenHourPkg = allPackages.find(p =>
    Number(p.total_hours) === 10 && (p.lesson_category_tag === 'private' || (p.name || '').toLowerCase().includes('private'))
  );
  if (!tenHourPkg) {
    console.log('3️⃣  Creating 10-hour private lesson package...');
    const lessonSvc = lessonServices[0];
    tenHourPkg = await api('POST', '/services/packages', {
      name: '10 Hour Private Kitesurfing Package',
      price: 1200,
      currency: 'EUR',
      prices: [
        { currencyCode: 'EUR', price: 1200 },
        { currencyCode: 'TRY', price: 42000 },
      ],
      totalHours: 10,
      sessionsCount: 10,
      lessonServiceName: lessonSvc?.name || 'Private Kitesurfing Lesson',
      lessonServiceId: lessonSvc?.id,
      packageType: 'lesson',
      disciplineTag: 'kite',
      lessonCategoryTag: 'private',
      levelTag: 'beginner',
      description: '10 hours of private kitesurfing lessons for all levels',
    }, token);
    manifest.createdPackageDefinition = tenHourPkg.id;
    saveManifest();
    console.log(`   ✅ Created package: ${tenHourPkg.name || tenHourPkg.id}\n`);
  } else {
    console.log(`3️⃣  Using existing 10h package: ${tenHourPkg.name}\n`);
  }

  // Ensure we have rental equipment
  let rentalEquipmentIds = rentalServices.map(s => s.id).filter(Boolean);
  if (rentalEquipmentIds.length === 0) {
    console.log('   ⚠️  No rental equipment found. Creating a standard rental service...');
    try {
      const rentalSvc = await api('POST', '/services', {
        name: 'Standard Kite Equipment Rental',
        category: 'rentals',
        service_type: 'rental',
        price: 50,
        currency: 'EUR',
        description: 'Standard kite equipment full day rental',
        status: 'active',
      }, token);
      rentalEquipmentIds = [rentalSvc.id];
      manifest.createdRentalService = rentalSvc.id;
      saveManifest();
      console.log(`   ✅ Created rental service: ${rentalSvc.id}\n`);
    } catch (e) {
      console.log(`   ⚠️  Could not create rental service: ${e.message}. Rentals will be skipped.\n`);
    }
  }

  // ── Step 4: Create 50 customers ──
  console.log('4️⃣  Creating 50 Turkish customers...');
  const customers = [];
  for (let i = 0; i < 50; i++) {
    const data = generateCustomer(i);
    data.role_id = studentRoleId;
    try {
      const user = await api('POST', '/users', data, token);
      const userId = user.id || user.user?.id;
      customers.push({ ...data, id: userId, name: `${data.first_name} ${data.last_name}` });
      manifest.userIds.push(userId);
      if ((i + 1) % 10 === 0) {
        saveManifest();
        console.log(`   ... ${i + 1}/50 created`);
      }
    } catch (e) {
      console.log(`   ⚠️  Skipped ${data.first_name} ${data.last_name}: ${e.message}`);
    }
    await sleep(50);
  }
  saveManifest();
  console.log(`   ✅ Created ${customers.length} customers\n`);

  if (customers.length === 0) {
    console.log('❌ No customers created. Exiting.');
    process.exit(1);
  }

  // ── Step 5: Fund wallets ──
  console.log('5️⃣  Funding customer wallets (60 000 TRY each)...');
  for (const cust of customers) {
    try {
      await api('POST', '/wallet/manual-adjust', {
        userId: cust.id,
        amount: 60000,
        currency: 'TRY',
        description: 'Seed: initial wallet funding',
      }, token);
    } catch (e) {
      console.log(`   ⚠️  Wallet fund failed for ${cust.name}: ${e.message}`);
    }
  }
  console.log(`   ✅ Wallets funded\n`);

  // ── Step 6: 20 customers get 10-hour packages (admin-assigned) ──
  // Uses POST /services/customer-packages — admin endpoint that creates a
  // customer_package record and debits the customer balance.
  const packageBuyers = customers.slice(0, 20);
  const customerPackages = {}; // userId -> customerPackageId

  console.log('6️⃣  Assigning 10-hour packages to 20 customers...');
  for (const cust of packageBuyers) {
    try {
      const res = await api('POST', '/services/customer-packages', {
        customerId: cust.id,
        servicePackageId: tenHourPkg.id,
        packageName: tenHourPkg.name || '10 Hour Private Kitesurfing Package',
        lessonServiceName: tenHourPkg.lesson_service_name || lessonServices[0]?.name || 'Private Kitesurfing Lesson',
        totalHours: 10,
        purchasePrice: 1200,
        currency: 'EUR',
        notes: 'Seed: 10h private package',
        packageType: 'lesson',
        includesLessons: true,
      }, token);
      const cpId = res.id || res.customerPackageId;
      customerPackages[cust.id] = cpId;
      manifest.customerPackageIds.push(cpId);
    } catch (e) {
      console.log(`   ⚠️  Package assign failed for ${cust.name}: ${e.message}`);
    }
    await sleep(50);
  }
  saveManifest();
  const pkgCount = Object.keys(customerPackages).length;
  console.log(`   ✅ ${pkgCount} packages assigned\n`);

  // ── Step 7: 10 of those complete all 10 hours ──
  const completers = packageBuyers.slice(0, 10);
  console.log('7️⃣  Completing 10 hours of lessons for 10 customers...');

  const lessonInstructor = instructors[0]?.id;
  const lessonServiceId = lessonServices[0]?.id;

  for (const cust of completers) {
    const cpId = customerPackages[cust.id];
    for (let hour = 0; hour < 10; hour++) {
      const lessonDate = new Date();
      lessonDate.setDate(lessonDate.getDate() - (10 - hour));
      const dateStr = lessonDate.toISOString().split('T')[0];

      try {
        const booking = await api('POST', '/bookings?force=true', {
          date: dateStr,
          start_hour: 9 + (hour % 6),
          duration: 1,
          student_user_id: cust.id,
          instructor_user_id: lessonInstructor,
          service_id: lessonServiceId,
          use_package: !!cpId,
          customer_package_id: cpId || undefined,
          payment_method: cpId ? 'package' : 'wallet',
          notes: `Seed: lesson ${hour + 1}/10 for ${cust.first_name}`,
          location: 'Beach',
        }, token);

        const bookingId = booking.id || booking.booking?.id;
        if (bookingId) {
          manifest.bookingIds.push(bookingId);
          await api('PUT', `/bookings/${bookingId}`, { status: 'completed' }, token);
        }
      } catch (e) {
        console.log(`   ⚠️  Lesson ${hour + 1} for ${cust.name}: ${e.message}`);
      }
      await sleep(30);
    }
  }
  saveManifest();
  console.log(`   ✅ 10 customers completed 10 hours each\n`);

  // ── Step 8: 15 customers book individual private lessons ──
  const individualBuyers = customers.slice(20, 35);
  console.log('8️⃣  Booking individual private lessons for 15 customers...');

  for (const cust of individualBuyers) {
    const numLessons = rngInt(1, 3);
    for (let l = 0; l < numLessons; l++) {
      const lessonDate = new Date();
      lessonDate.setDate(lessonDate.getDate() - rngInt(0, 14));
      const dateStr = lessonDate.toISOString().split('T')[0];

      try {
        const booking = await api('POST', '/bookings?force=true', {
          date: dateStr,
          start_hour: rngInt(9, 16),
          duration: 1,
          student_user_id: cust.id,
          instructor_user_id: rng(instructors)?.id || lessonInstructor,
          service_id: lessonServiceId,
          use_package: false,
          payment_method: 'wallet',
          notes: `Seed: individual private lesson for ${cust.first_name}`,
          location: 'Beach',
        }, token);

        const bookingId = booking.id || booking.booking?.id;
        if (bookingId) {
          manifest.bookingIds.push(bookingId);
          if (Math.random() < 0.6) {
            await api('PUT', `/bookings/${bookingId}`, { status: 'completed' }, token);
          }
        }
      } catch (e) {
        console.log(`   ⚠️  Individual lesson for ${cust.name}: ${e.message}`);
      }
      await sleep(30);
    }
  }
  saveManifest();
  console.log(`   ✅ Individual lessons booked\n`);

  // ── Step 9: 15 customers get standard rentals ──
  const rentalCustomers = customers.slice(35, 50);
  console.log('9️⃣  Creating standard rentals for 15 customers...');

  if (rentalEquipmentIds.length === 0) {
    console.log('   ⚠️  No rental equipment available. Skipping rentals.\n');
  } else {
    for (const cust of rentalCustomers) {
      const rentalDate = new Date();
      rentalDate.setDate(rentalDate.getDate() - rngInt(0, 10));
      const dateStr = rentalDate.toISOString().split('T')[0];
      const startDate = new Date(rentalDate); startDate.setHours(9, 0, 0);
      const endDate   = new Date(rentalDate); endDate.setHours(17, 0, 0);

      try {
        const rental = await api('POST', '/rentals', {
          user_id: cust.id,
          equipment_ids: [rng(rentalEquipmentIds)],
          rental_date: dateStr,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          status: 'active',
          payment_method: 'wallet',
          rental_days: 1,
          notes: `Seed: standard rental for ${cust.first_name}`,
        }, token);
        const rentalId = rental.id || rental.rental?.id;
        if (rentalId) manifest.rentalIds.push(rentalId);
      } catch (e) {
        console.log(`   ⚠️  Rental for ${cust.name}: ${e.message}`);
      }
      await sleep(50);
    }
    saveManifest();
    console.log(`   ✅ Rentals created\n`);
  }

  // ── Save final manifest ──
  saveManifest();

  console.log('═══════════════════════════════════════════════');
  console.log('✅ SEED COMPLETE');
  console.log(`   Customers:       ${customers.length}`);
  console.log(`   Packages:        ${pkgCount}`);
  console.log(`   Completions:     ${completers.length} × 10h`);
  console.log(`   Ind. lessons:    ${individualBuyers.length} customers`);
  console.log(`   Rentals:         ${manifest.rentalIds.length}`);
  console.log(`   Bookings:        ${manifest.bookingIds.length}`);
  console.log(`\n   📄 Manifest: ${MANIFEST_PATH}`);
  console.log('   Run  node scripts/seed-rollback.mjs  to undo everything.');
  console.log('═══════════════════════════════════════════════');
}

main().catch((err) => {
  saveManifest(); // save partial progress even on failure
  console.error('❌ Fatal error:', err.message);
  console.error('   Partial manifest saved — you can still rollback.');
  process.exit(1);
});
