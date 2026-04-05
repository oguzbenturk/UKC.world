/**
 * Seed Script: 2026 Price List
 *
 * Usage: node scripts/seed-2026-prices.mjs
 *
 * Creates (idempotently — skips if name already exists):
 *   1. Base lesson services
 *   2. Lesson packages (kite, wing foil, e-foil)
 *   3. Accommodation units
 *   4. Combo packages (hotel + lessons)
 *   5. Freerider / storage member offerings
 *   6. Rental services (kite, wing foil, foil, boards) — via POST /services
 *
 * All prices are "app" prices in EUR.
 * Images excluded — upload manually via admin UI.
 */

const API = process.env.API_URL || 'http://localhost:4000/api';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@plannivo.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'asdasd35';

// ─── API helper ──────────────────────────────────────────────────────────────

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
    const msg = typeof data === 'object'
      ? (data.error || data.message || JSON.stringify(data))
      : text;
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return data;
}

// Return a Map<name, id> of all existing items at an endpoint
async function existingMap(endpoint, token) {
  try {
    const data = await api('GET', endpoint, null, token);
    const arr = Array.isArray(data)
      ? data
      : (data.services || data.packages || data.units || data.offerings || data.data || []);
    return new Map(arr.map(r => [r.name, r.id]));
  } catch { return new Map(); }
}

function log(label, name) {
  console.log(`  ✅ [${label}] ${name} — created`);
}

// ─── WIPE ALL ────────────────────────────────────────────────────────────────
// Deletes every service-package, service, accommodation unit, and member
// offering currently in the DB so the seed recreates a clean slate.

async function deleteEach(items, deleteUrl, token) {
  for (const [name, id] of items) {
    try {
      await api('DELETE', `${deleteUrl}/${id}`, null, token);
      console.log(`   🗑  ${name}`);
    } catch (err) {
      console.warn(`   ⚠  Could not delete "${name}": ${err.message}`);
    }
  }
}

async function wipeAll(token) {
  console.log('\n🗑  Wiping all existing data before reseed...');

  // Packages first — they reference services
  const pkgs = await existingMap('/services/packages', token);
  if (pkgs.size) {
    console.log(`\n  Packages (${pkgs.size}):`);
    await deleteEach(pkgs, '/services/packages', token);
  }

  // Force-delete any orphaned packages that normal delete may miss
  const pkgs2 = await existingMap('/services/packages', token);
  for (const [name, id] of pkgs2) {
    try { await api('DELETE', `/services/packages/${id}/force`, null, token); console.log(`   🗑  (force) ${name}`); }
    catch (err) { console.warn(`   ⚠  Force delete failed for "${name}": ${err.message}`); }
  }

  // All services (lesson + rental + any others)
  const svcs = await existingMap('/services', token);
  if (svcs.size) {
    console.log(`\n  Services (${svcs.size}):`);
    await deleteEach(svcs, '/services', token);
  }

  // All accommodation units
  const units = await existingMap('/accommodation/units', token);
  if (units.size) {
    console.log(`\n  Accommodation units (${units.size}):`);
    await deleteEach(units, '/accommodation/units', token);
  }

  // All member offerings
  const offerings = await existingMap('/member-offerings', token);
  if (offerings.size) {
    console.log(`\n  Member offerings (${offerings.size}):`);
    await deleteEach(offerings, '/member-offerings', token);
  }

  console.log('\n  ✅ Wipe complete.\n');
}

// ─── 1. BASE SERVICES ────────────────────────────────────────────────────────

const SERVICES = [
  {
    name: 'Private Kitesurfing Lesson',
    description: 'One instructor, entirely yours. The fastest and most personal way to learn.',
    category: 'lesson', level: 'all-levels', serviceType: 'private',
    duration: 1, price: 95, currency: 'EUR',
    disciplineTag: 'kite', lessonCategoryTag: 'private', levelTag: 'all',
  },
  {
    name: 'Semi-Private Kitesurfing Lesson',
    description: 'Two students, two kites. Same private quality — split between two riders.',
    category: 'lesson', level: 'all-levels', serviceType: 'semi_private',
    duration: 1, price: 65, currency: 'EUR',
    disciplineTag: 'kite', lessonCategoryTag: 'semi-private', levelTag: 'all',
    maxParticipants: 2,
  },
  {
    name: 'Group Kitesurfing Lesson',
    description: 'Two students, one kite. Take turns, keep costs down, keep it fun.',
    category: 'lesson', level: 'beginner', serviceType: 'group',
    duration: 1, price: 56, currency: 'EUR',
    disciplineTag: 'kite', lessonCategoryTag: 'group', levelTag: 'beginner',
    maxParticipants: 2,
  },
  {
    name: 'Advanced Kitesurfing Lesson',
    description: 'Precision coaching for riders who already know the basics and want more.',
    category: 'lesson', level: 'advanced', serviceType: 'private',
    duration: 1, price: 95, currency: 'EUR',
    disciplineTag: 'kite', lessonCategoryTag: 'private', levelTag: 'advanced',
  },
  {
    name: 'Kite Foiling Lesson',
    description: 'Silent flight above the water. Coached kite foiling for experienced kiters.',
    category: 'lesson', level: 'advanced', serviceType: 'private',
    duration: 1, price: 95, currency: 'EUR',
    disciplineTag: 'kite_foil', lessonCategoryTag: 'private', levelTag: 'advanced',
  },
  {
    name: 'Supervision Session',
    description: 'Free-ride with an expert watching. Real feedback on your real riding.',
    category: 'lesson', level: 'all-levels', serviceType: 'supervision',
    duration: 1, price: 70, currency: 'EUR',
    disciplineTag: 'kite', lessonCategoryTag: 'supervision', levelTag: 'all',
  },
  {
    name: 'Boat Lesson',
    description: 'A motorboat keeps pace with you — more wind time, faster results.',
    category: 'lesson', level: 'all-levels', serviceType: 'private',
    duration: 1, price: 120, currency: 'EUR',
    disciplineTag: 'kite', lessonCategoryTag: 'private', levelTag: 'all',
  },
  {
    name: 'Premium Lesson',
    description: 'Our most experienced instructors. No compromise, no distractions.',
    category: 'lesson', level: 'all-levels', serviceType: 'private',
    duration: 1, price: 135, currency: 'EUR',
    disciplineTag: 'kite', lessonCategoryTag: 'private', levelTag: 'all',
  },
  {
    name: 'Private Wing Foil Lesson',
    description: 'The world\'s fastest-growing watersport, taught properly from day one.',
    category: 'lesson', level: 'all-levels', serviceType: 'private',
    duration: 1, price: 95, currency: 'EUR',
    disciplineTag: 'wing', lessonCategoryTag: 'private', levelTag: 'all',
  },
  {
    name: 'Semi-Private Wing Foil Lesson',
    description: 'Two students, two wing setups. Same quality coaching — shared between two riders.',
    category: 'lesson', level: 'all-levels', serviceType: 'semi_private',
    duration: 1, price: 65, currency: 'EUR',
    disciplineTag: 'wing', lessonCategoryTag: 'semi-private', levelTag: 'all',
    maxParticipants: 2,
  },
  {
    name: 'Group Wing Foil Lesson',
    description: 'Two students, one wing. Take turns, build confidence, keep costs down.',
    category: 'lesson', level: 'beginner', serviceType: 'group',
    duration: 1, price: 56, currency: 'EUR',
    disciplineTag: 'wing', lessonCategoryTag: 'group', levelTag: 'beginner',
    maxParticipants: 2,
  },
  {
    name: 'Advanced Wing Foil Lesson',
    description: 'Coached progression for wing riders working on foil starts, gybes and tacks.',
    category: 'lesson', level: 'advanced', serviceType: 'private',
    duration: 1, price: 95, currency: 'EUR',
    disciplineTag: 'wing', lessonCategoryTag: 'private', levelTag: 'advanced',
  },
  {
    name: 'E-Foil Lesson',
    description: 'No wind. No noise. Pure electric flight above the water.',
    category: 'lesson', level: 'all-levels', serviceType: 'private',
    duration: 1, price: 135, currency: 'EUR',
    disciplineTag: 'efoil', lessonCategoryTag: 'private', levelTag: 'all',
  },
];

async function seedServices(token) {
  console.log('\n📘 Services');
  for (const svc of SERVICES) {
    await api('POST', '/services', svc, token);
    log('service', svc.name);
  }
}

// ─── 2. LESSON PACKAGES ──────────────────────────────────────────────────────

function lessonPkg(overrides) {
  return {
    currency: 'EUR',
    packageType: 'lesson',
    includesLessons: true,
    includesRental: false,
    includesAccommodation: false,
    ...overrides,
  };
}

// serviceIdMap: { [serviceName]: id } — populated after fetching services
function buildLessonPackages(serviceIdMap) {
  const kitePvId  = serviceIdMap['Private Kitesurfing Lesson'];
  const kiteSPId  = serviceIdMap['Semi-Private Kitesurfing Lesson'];
  const kiteGrpId = serviceIdMap['Group Kitesurfing Lesson'];
  const kiteAdvId = serviceIdMap['Advanced Kitesurfing Lesson'];
  const kiteFoilId = serviceIdMap['Kite Foiling Lesson'];
  const supervId  = serviceIdMap['Supervision Session'];
  const boatId    = serviceIdMap['Boat Lesson'];
  const premiumId = serviceIdMap['Premium Lesson'];
  const wingPvId  = serviceIdMap['Private Wing Foil Lesson'];
  const wingSpId  = serviceIdMap['Semi-Private Wing Foil Lesson'];
  const wingGrpId = serviceIdMap['Group Wing Foil Lesson'];
  const wingAdvId = serviceIdMap['Advanced Wing Foil Lesson'];
  const efoilId   = serviceIdMap['E-Foil Lesson'];

  return [
    // ── Kite Beginner Private ──────────────────────────────────────
    lessonPkg({
      name: 'Kite Beginner 6H',
      description: 'The essential foundation. Kite theory, wind safety, body dragging, first water starts. Most riders leave with full kite control.',
      price: 500, totalHours: 6, sessionsCount: 3,
      lessonServiceId: kitePvId, lessonServiceName: 'Private Kitesurfing Lesson',
      disciplineTag: 'kite', lessonCategoryTag: 'private', levelTag: 'beginner',
    }),
    lessonPkg({
      name: 'Kite Beginner 10H',
      description: 'Go further, faster. Everything in 6H plus board skills and your first real rides — the package most students use to reach independent riding.',
      price: 780, totalHours: 10, sessionsCount: 5,
      lessonServiceId: kitePvId, lessonServiceName: 'Private Kitesurfing Lesson',
      disciplineTag: 'kite', lessonCategoryTag: 'private', levelTag: 'beginner',
    }),

    // ── Kite Semi-Private (per person) ────────────────────────────
    lessonPkg({
      name: 'Kite Semi-Private 6H',
      description: 'Two friends, two kites, one instructor. You each progress at your own pace — together.',
      price: 390, totalHours: 6, sessionsCount: 3,
      lessonServiceId: kiteSPId, lessonServiceName: 'Semi-Private Kitesurfing Lesson',
      disciplineTag: 'kite', lessonCategoryTag: 'semi-private', levelTag: 'beginner',
    }),
    lessonPkg({
      name: 'Kite Semi-Private 10H',
      description: 'Extended semi-private with full progression to riding. The complete learning arc, shared.',
      price: 600, totalHours: 10, sessionsCount: 5,
      lessonServiceId: kiteSPId, lessonServiceName: 'Semi-Private Kitesurfing Lesson',
      disciplineTag: 'kite', lessonCategoryTag: 'semi-private', levelTag: 'beginner',
    }),

    // ── Kite Group (2 students, 1 kite, per person) ───────────────
    lessonPkg({
      name: 'Kite Group 6H',
      description: 'Team up and take turns. One kite, two students — a great option when you want the social experience without the private price.',
      price: 335, totalHours: 6, sessionsCount: 3,
      lessonServiceId: kiteGrpId, lessonServiceName: 'Group Kitesurfing Lesson',
      disciplineTag: 'kite', lessonCategoryTag: 'group', levelTag: 'beginner',
    }),
    lessonPkg({
      name: 'Kite Group 9H',
      description: 'More time, more progression. Nine hours of shared kite learning with a friend.',
      price: 500, totalHours: 9, sessionsCount: 4,
      lessonServiceId: kiteGrpId, lessonServiceName: 'Group Kitesurfing Lesson',
      disciplineTag: 'kite', lessonCategoryTag: 'group', levelTag: 'beginner',
    }),

    // ── Kite Advanced ─────────────────────────────────────────────
    lessonPkg({
      name: 'Advanced Kite 1H',
      description: 'One focused hour to sharpen a specific skill — transitions, jumps, or getting your edge back after time off.',
      price: 95, totalHours: 1, sessionsCount: 1,
      lessonServiceId: kiteAdvId, lessonServiceName: 'Advanced Kitesurfing Lesson',
      disciplineTag: 'kite', lessonCategoryTag: 'private', levelTag: 'advanced',
    }),
    lessonPkg({
      name: 'Advanced Kite 4H',
      description: 'A proper session block for riders who know what they want to work on. Four hours, real results.',
      price: 335, totalHours: 4, sessionsCount: 2,
      lessonServiceId: kiteAdvId, lessonServiceName: 'Advanced Kitesurfing Lesson',
      disciplineTag: 'kite', lessonCategoryTag: 'private', levelTag: 'advanced',
    }),

    // ── Kite Foiling ──────────────────────────────────────────────
    lessonPkg({
      name: 'Kite Foil 1H',
      description: 'Your first taste of silent flight. One coached hour to feel what it\'s like to ride above the water.',
      price: 95, totalHours: 1, sessionsCount: 1,
      lessonServiceId: kiteFoilId, lessonServiceName: 'Kite Foiling Lesson',
      disciplineTag: 'kite_foil', lessonCategoryTag: 'private', levelTag: 'advanced',
    }),
    lessonPkg({
      name: 'Kite Foil 4H',
      description: 'Serious foil progression. Four hours to dial your foil starts and make your first real upwind attempts.',
      price: 335, totalHours: 4, sessionsCount: 2,
      lessonServiceId: kiteFoilId, lessonServiceName: 'Kite Foiling Lesson',
      disciplineTag: 'kite_foil', lessonCategoryTag: 'private', levelTag: 'advanced',
    }),

    // ── Supervision ───────────────────────────────────────────────
    lessonPkg({
      name: 'Supervision 1H',
      description: 'Ride your own lines with an expert watching. One hour of sharp, honest feedback on your technique.',
      price: 70, totalHours: 1, sessionsCount: 1,
      lessonServiceId: supervId, lessonServiceName: 'Supervision Session',
      disciplineTag: 'kite', lessonCategoryTag: 'supervision', levelTag: 'all',
    }),
    lessonPkg({
      name: 'Supervision 4H',
      description: 'A full supervised session — free-ride your best, coached the whole way.',
      price: 240, totalHours: 4, sessionsCount: 2,
      lessonServiceId: supervId, lessonServiceName: 'Supervision Session',
      disciplineTag: 'kite', lessonCategoryTag: 'supervision', levelTag: 'all',
    }),

    // ── Other ─────────────────────────────────────────────────────
    lessonPkg({
      name: 'Boat Lesson',
      description: 'A motorboat keeps pace with you — no downtime, more wind windows, faster progression.',
      price: 120, totalHours: 1, sessionsCount: 1,
      lessonServiceId: boatId, lessonServiceName: 'Boat Lesson',
      disciplineTag: 'kite', lessonCategoryTag: 'private', levelTag: 'all',
    }),
    lessonPkg({
      name: 'Premium Lesson 1H',
      description: 'One instructor, fully dedicated. Our most senior coaches, no distractions, no compromise.',
      price: 135, totalHours: 1, sessionsCount: 1,
      lessonServiceId: premiumId, lessonServiceName: 'Premium Lesson',
      disciplineTag: 'kite', lessonCategoryTag: 'private', levelTag: 'all',
    }),

    // ── Wing Foil ─────────────────────────────────────────────────
    lessonPkg({
      name: 'Wing Foil Beginner 6H',
      description: 'From holding the wing for the first time to gliding on the board — the world\'s fastest-growing watersport, made accessible.',
      price: 500, totalHours: 6, sessionsCount: 3,
      lessonServiceId: wingPvId, lessonServiceName: 'Private Wing Foil Lesson',
      disciplineTag: 'wing', lessonCategoryTag: 'private', levelTag: 'beginner',
    }),
    lessonPkg({
      name: 'Wing Foil Beginner 10H',
      description: 'Master the fundamentals and start your first foil attempts. Ten hours to go from zero to confident wing rider.',
      price: 780, totalHours: 10, sessionsCount: 5,
      lessonServiceId: wingPvId, lessonServiceName: 'Private Wing Foil Lesson',
      disciplineTag: 'wing', lessonCategoryTag: 'private', levelTag: 'beginner',
    }),
    // ── Wing Foil Semi-Private ─────────────────────────────────────
    lessonPkg({
      name: 'Wing Foil Semi-Private 6H',
      description: 'Two friends, two wings, one instructor. You each progress at your own pace — together.',
      price: 390, totalHours: 6, sessionsCount: 3,
      lessonServiceId: wingSpId, lessonServiceName: 'Semi-Private Wing Foil Lesson',
      disciplineTag: 'wing', lessonCategoryTag: 'semi-private', levelTag: 'beginner',
    }),
    lessonPkg({
      name: 'Wing Foil Semi-Private 10H',
      description: 'Extended semi-private with full progression to riding. The complete learning arc, shared.',
      price: 600, totalHours: 10, sessionsCount: 5,
      lessonServiceId: wingSpId, lessonServiceName: 'Semi-Private Wing Foil Lesson',
      disciplineTag: 'wing', lessonCategoryTag: 'semi-private', levelTag: 'beginner',
    }),

    // ── Wing Foil Group ────────────────────────────────────────────
    lessonPkg({
      name: 'Wing Foil Group 6H',
      description: 'Team up and take turns. One wing, two students — the social way to learn wing foiling.',
      price: 335, totalHours: 6, sessionsCount: 3,
      lessonServiceId: wingGrpId, lessonServiceName: 'Group Wing Foil Lesson',
      disciplineTag: 'wing', lessonCategoryTag: 'group', levelTag: 'beginner',
    }),
    lessonPkg({
      name: 'Wing Foil Group 9H',
      description: 'More time, more progression. Nine hours of shared wing foil learning with a friend.',
      price: 500, totalHours: 9, sessionsCount: 4,
      lessonServiceId: wingGrpId, lessonServiceName: 'Group Wing Foil Lesson',
      disciplineTag: 'wing', lessonCategoryTag: 'group', levelTag: 'beginner',
    }),

    lessonPkg({
      name: 'Wing Foil Advanced 1H',
      description: 'Focused coaching for wing foilers working on foil starts, gybes, or tack attempts.',
      price: 95, totalHours: 1, sessionsCount: 1,
      lessonServiceId: wingAdvId, lessonServiceName: 'Advanced Wing Foil Lesson',
      disciplineTag: 'wing', lessonCategoryTag: 'private', levelTag: 'advanced',
    }),
    lessonPkg({
      name: 'Wing Foil Advanced 4H',
      description: 'Four coached hours on the wing and foil — enough to make measurable progress in one block.',
      price: 335, totalHours: 4, sessionsCount: 2,
      lessonServiceId: wingAdvId, lessonServiceName: 'Advanced Wing Foil Lesson',
      disciplineTag: 'wing', lessonCategoryTag: 'private', levelTag: 'advanced',
    }),

    // ── E-Foil ────────────────────────────────────────────────────
    lessonPkg({
      name: 'E-Foil Lesson 1H',
      description: 'No wind needed. Sixty minutes on our Fliteboard e-foil — coached, quiet, unforgettable.',
      price: 135, totalHours: 1, sessionsCount: 1,
      lessonServiceId: efoilId, lessonServiceName: 'E-Foil Lesson',
      disciplineTag: 'efoil', lessonCategoryTag: 'private', levelTag: 'all',
    }),
    lessonPkg({
      name: 'E-Foil Lesson 2H',
      description: 'Two hours gives you the space to go from wobbly to genuinely comfortable up on foil.',
      price: 270, totalHours: 2, sessionsCount: 1,
      lessonServiceId: efoilId, lessonServiceName: 'E-Foil Lesson',
      disciplineTag: 'efoil', lessonCategoryTag: 'private', levelTag: 'all',
    }),
    lessonPkg({
      name: 'E-Foil Lesson 4H',
      description: 'Half a day of electric foiling. By the end, most riders can cruise independently.',
      price: 540, totalHours: 4, sessionsCount: 2,
      lessonServiceId: efoilId, lessonServiceName: 'E-Foil Lesson',
      disciplineTag: 'efoil', lessonCategoryTag: 'private', levelTag: 'all',
    }),
  ];
}

async function seedLessonPackages(token) {
  console.log('\n📗 Lesson Packages');

  const svcData = await api('GET', '/services', null, token);
  const svcArr = Array.isArray(svcData) ? svcData : (svcData.services || []);
  const serviceIdMap = {};
  svcArr.forEach(s => { serviceIdMap[s.name] = s.id; });

  for (const pkg of buildLessonPackages(serviceIdMap)) {
    await api('POST', '/services/packages', pkg, token);
    log('lesson pkg', pkg.name);
  }
}

// ─── 3. ACCOMMODATION UNITS ──────────────────────────────────────────────────

const ACCOMMODATION_UNITS = [
  {
    name: 'Bag Evi 1+1 (Private Pool)',
    type: 'studio', category: 'own', capacity: 2,
    price_per_night: 100, status: 'Available',
    description: 'A private 1+1 studio with your own pool and garden. Steps from the beach — wake up, swim, kite.',
    amenities: { weekly_price: 600, weekly_price_double_pp: 420, daily_price_double_pp: 70 },
  },
  {
    name: 'Studio 3 (Private Garden)',
    type: 'studio', category: 'own', capacity: 2,
    price_per_night: 90, status: 'Available',
    description: 'A calm studio with a secluded private garden. Your own outdoor space between sessions.',
    amenities: { weekly_price: 450, weekly_price_double_pp: 210, daily_price_double_pp: 50 },
  },
  {
    name: 'Standard Room',
    type: 'hotel', category: 'own', capacity: 2,
    price_per_night: 115, status: 'Available',
    description: 'Clean, comfortable, at the heart of the resort. Everything you need, nothing you don\'t.',
    amenities: {},
  },
  {
    name: 'Sea View Room',
    type: 'hotel', category: 'own', capacity: 2,
    price_per_night: 140, status: 'Available',
    description: 'Wake up to open water. A sea-facing room with full views and natural light all day.',
    amenities: {},
  },
  {
    name: 'Sea View Terrasse',
    type: 'hotel', category: 'own', capacity: 2,
    price_per_night: 150, status: 'Available',
    description: 'Uninterrupted sea views with your own terrasse. The perfect place to watch the sunset after a session.',
    amenities: {},
  },
];

async function seedAccommodationUnits(token) {
  console.log('\n🏠 Accommodation Units');
  const idMap = {};
  for (const unit of ACCOMMODATION_UNITS) {
    const created = await api('POST', '/accommodation/units', unit, token);
    idMap[unit.name] = created.id;
    log('accomm unit', unit.name);
  }
  return idMap;
}

// ─── 4. COMBO PACKAGES (accommodation + lessons) ─────────────────────────────

async function seedComboPackages(token, unitIdMap) {
  console.log('\n🏨 Combo Packages (Hotel + Lessons)');

  // Get service IDs for lesson references
  const svcData = await api('GET', '/services', null, token);
  const svcArr = Array.isArray(svcData) ? svcData : (svcData.services || []);
  const kitePvId = svcArr.find(s => s.name === 'Private Kitesurfing Lesson')?.id;
  const kiteSPId = svcArr.find(s => s.name === 'Semi-Private Kitesurfing Lesson')?.id;

  const standardRoomId = unitIdMap['Standard Room'];

  const COMBO_PACKAGES = [
    {
      name: 'Weekend Kite Package — Private',
      description: 'Two nights and 6 hours of private kite lessons. Arrive Friday, leave Sunday riding. Hotel and coaching, one price.',
      price: 660, currency: 'EUR',
      packageType: 'accommodation_lesson',
      includesLessons: true, includesAccommodation: true, includesRental: false,
      totalHours: 6, sessionsCount: 3,
      accommodationNights: 2,
      accommodationUnitId: standardRoomId || null,
      accommodationUnitName: 'Standard Room',
      lessonServiceId: kitePvId, lessonServiceName: 'Private Kitesurfing Lesson',
      disciplineTag: 'kite', lessonCategoryTag: 'private', levelTag: 'beginner',
    },
    {
      name: '1-Week Kite Package — Private',
      description: 'Seven nights, 12 hours of private coaching. Enough time to genuinely go from beginner to rider.',
      price: 1660, currency: 'EUR',
      packageType: 'accommodation_lesson',
      includesLessons: true, includesAccommodation: true, includesRental: false,
      totalHours: 12, sessionsCount: 6,
      accommodationNights: 7,
      accommodationUnitId: standardRoomId || null,
      accommodationUnitName: 'Standard Room',
      lessonServiceId: kitePvId, lessonServiceName: 'Private Kitesurfing Lesson',
      disciplineTag: 'kite', lessonCategoryTag: 'private', levelTag: 'beginner',
    },
    {
      name: 'Weekend Kite Package — Semi-Private',
      description: 'A weekend for two — 2 nights and 6 shared lesson hours. Perfect for couples or friends learning together.',
      price: 435, currency: 'EUR',
      packageType: 'accommodation_lesson',
      includesLessons: true, includesAccommodation: true, includesRental: false,
      totalHours: 6, sessionsCount: 3,
      accommodationNights: 2,
      accommodationUnitId: standardRoomId || null,
      accommodationUnitName: 'Standard Room',
      lessonServiceId: kiteSPId, lessonServiceName: 'Semi-Private Kitesurfing Lesson',
      disciplineTag: 'kite', lessonCategoryTag: 'semi-private', levelTag: 'beginner',
    },
    {
      name: '1-Week Kite Package — Semi-Private',
      description: 'Seven nights and 12 lesson hours for two riders sharing. The best value kite holiday for pairs.',
      price: 1045, currency: 'EUR',
      packageType: 'accommodation_lesson',
      includesLessons: true, includesAccommodation: true, includesRental: false,
      totalHours: 12, sessionsCount: 6,
      accommodationNights: 7,
      accommodationUnitId: standardRoomId || null,
      accommodationUnitName: 'Standard Room',
      lessonServiceId: kiteSPId, lessonServiceName: 'Semi-Private Kitesurfing Lesson',
      disciplineTag: 'kite', lessonCategoryTag: 'semi-private', levelTag: 'beginner',
    },
  ];

  for (const pkg of COMBO_PACKAGES) {
    await api('POST', '/services/packages', pkg, token);
    log('combo pkg', pkg.name);
  }
}

// ─── 5. MEMBER OFFERINGS (freerider / storage) ───────────────────────────────

const MEMBER_OFFERINGS = [
  // ── Beach Fee ──────────────────────────────────────────────────
  {
    name: 'Beach Day Pass',
    description: 'Full beach access for the day — launch area, facilities, and the spot.',
    price: 12, period: 'day', duration_days: 1,
    icon: 'star', category: 'freerider', sort_order: 1, is_active: true,
    features: ['Launch & land access', 'Beach facilities', 'School zone'],
  },
  {
    name: 'Beach Week Pass',
    description: 'Seven days of unrestricted beach access. Ideal for riders passing through.',
    price: 72, period: 'day', duration_days: 7,
    icon: 'star', category: 'freerider', sort_order: 2, is_active: true,
    features: ['7 days launch & land access', 'Beach facilities', 'School zone'],
  },
  {
    name: 'Beach Monthly Pass',
    description: 'A month of daily beach access. For riders spending an extended stint at the spot.',
    price: 200, period: 'month', duration_days: 30,
    icon: 'trophy', category: 'freerider', sort_order: 3, is_active: true,
    features: ['30 days launch & land access', 'Beach facilities', 'School zone'],
  },
  {
    name: 'Beach Season Pass',
    description: 'Unlimited beach access for the full season. One payment, done.',
    price: 400, period: 'season', duration_days: 180,
    icon: 'crown', category: 'freerider', sort_order: 4, is_active: true,
    highlighted: true,
    features: ['Full season launch & land access', 'Beach facilities', 'School zone', 'Priority spot'],
  },

  // ── Storage + Beach ────────────────────────────────────────────
  {
    name: 'Storage + Beach — Day',
    description: 'Beach access plus secure gear storage. Ride, pack up, leave your kit safely until tomorrow.',
    price: 17, period: 'day', duration_days: 1,
    icon: 'thunder', category: 'storage', sort_order: 5, is_active: true,
    features: ['Beach day access', 'Secure equipment storage'],
  },
  {
    name: 'Storage + Beach — Week',
    description: 'Seven days of access and dedicated storage. Your gear stays at the spot — you just ride.',
    price: 100, period: 'day', duration_days: 7,
    icon: 'thunder', category: 'storage', sort_order: 6, is_active: true,
    features: ['7 days beach access', 'Secure equipment storage'],
  },
  {
    name: 'Storage + Beach — Month',
    description: 'A full month of access and storage. Ride daily without the logistics.',
    price: 330, period: 'month', duration_days: 30,
    icon: 'thunder', category: 'storage', sort_order: 7, is_active: true,
    features: ['30 days beach access', 'Secure equipment storage', 'Named storage spot'],
  },
  {
    name: 'Storage + Beach — Season',
    description: 'Full beach access and secure equipment storage for the entire season.',
    price: 550, period: 'season', duration_days: 180,
    icon: 'crown', category: 'storage', sort_order: 8, is_active: true,
    highlighted: true,
    features: ['Full season beach access', 'Secure equipment storage', 'Named storage spot', 'Priority access'],
  },

  // ── Winter Storage ─────────────────────────────────────────────
  {
    name: 'Winter Storage',
    description: 'Keep your kit safe with us over the off-season. Dry, secure, ready for when the wind returns.',
    price: 200, period: 'season', duration_days: 180,
    icon: 'gift', category: 'storage', sort_order: 9, is_active: true,
    features: ['Dry indoor storage', 'Named storage spot', 'Off-season security'],
  },
];

async function seedMemberOfferings(token) {
  console.log('\n🎫 Member Offerings');
  for (const offering of MEMBER_OFFERINGS) {
    await api('POST', '/member-offerings', offering, token);
    log('offering', offering.name);
  }
}

// ─── 6. RENTAL SERVICES ──────────────────────────────────────────────────────
// Rentals are individual services (category='rental'), NOT service_packages.

function rentalSvc(overrides) {
  return { category: 'rental', serviceType: 'rental', currency: 'EUR', level: 'all', ...overrides };
}

const RENTAL_SERVICES = [
  // ── Kite — Standard ───────────────────────────────────────────
  rentalSvc({
    name: 'Kite — 1H',
    description: 'Standard Duotone kite, bar, harness, and board — everything you need, ready to launch.',
    price: 45, duration: 1, disciplineTag: 'kite', rentalSegment: 'standard',
  }),
  rentalSvc({
    name: 'Kite — Half Day',
    description: 'Four hours of open water. Mid-morning to lunch, or afternoon into sunset — your call.',
    price: 70, duration: 4, disciplineTag: 'kite', rentalSegment: 'standard',
  }),
  rentalSvc({
    name: 'Kite — Full Day',
    description: 'Yours from first light to last session. A complete Duotone kite set, no clock-watching.',
    price: 90, duration: 8, disciplineTag: 'kite', rentalSegment: 'standard',
  }),
  rentalSvc({
    name: 'Kite — 1 Week',
    description: 'Seven days of riding on demand. The most cost-efficient way to ride daily without your own gear.',
    price: 460, duration: 168, disciplineTag: 'kite', rentalSegment: 'standard',
  }),

  // ── Kite — SLS ────────────────────────────────────────────────
  rentalSvc({
    name: 'Kite SLS — 1H',
    description: "Duotone's SLS technology — lighter, faster, more responsive. You'll feel the difference from the first launch.",
    price: 48, duration: 1, disciplineTag: 'kite', rentalSegment: 'sls',
  }),
  rentalSvc({
    name: 'Kite SLS — Half Day',
    description: "Four hours on our performance SLS setup. If you've outgrown standard kit, this is the next step.",
    price: 78, duration: 4, disciplineTag: 'kite', rentalSegment: 'sls',
  }),
  rentalSvc({
    name: 'Kite SLS — Full Day',
    description: 'A full day with the best-performing kite in our fleet. Lighter, more precise, faster.',
    price: 100, duration: 8, disciplineTag: 'kite', rentalSegment: 'sls',
  }),
  rentalSvc({
    name: 'Kite SLS — 1 Week',
    description: "Seven days on the SLS setup. Once you ride it, it's hard to go back.",
    price: 600, duration: 168, disciplineTag: 'kite', rentalSegment: 'sls',
  }),

  // ── Kite — D-LAB ──────────────────────────────────────────────
  rentalSvc({
    name: 'Kite D-LAB — 1H',
    description: "Duotone's D-LAB flagship — the pinnacle of kite engineering. Reserved for riders who can make the most of it.",
    price: 58, duration: 1, disciplineTag: 'kite', rentalSegment: 'dlab',
  }),
  rentalSvc({
    name: 'Kite D-LAB — Half Day',
    description: 'Four hours on the most advanced kite we carry. No compromises, no limits.',
    price: 90, duration: 4, disciplineTag: 'kite', rentalSegment: 'dlab',
  }),
  rentalSvc({
    name: 'Kite D-LAB — Full Day',
    description: "A full day on the D-LAB. If you know what it is, you already know why you want it.",
    price: 130, duration: 8, disciplineTag: 'kite', rentalSegment: 'dlab',
  }),

  // ── Wing Foil — Standard ──────────────────────────────────────
  rentalSvc({
    name: 'Wing Foil — 1H',
    description: 'Wing, foil board, and foil — everything to get airborne. One hour of pure wing foiling.',
    price: 45, duration: 1, disciplineTag: 'wing', rentalSegment: 'standard',
  }),
  rentalSvc({
    name: 'Wing Foil — Half Day',
    description: 'Four hours with a complete wing foil setup. Find your rhythm and start flying.',
    price: 70, duration: 4, disciplineTag: 'wing', rentalSegment: 'standard',
  }),
  rentalSvc({
    name: 'Wing Foil — Full Day',
    description: 'A full day on the wing and foil. The best way to build real time and real confidence.',
    price: 90, duration: 8, disciplineTag: 'wing', rentalSegment: 'standard',
  }),
  rentalSvc({
    name: 'Wing Foil — 1 Week',
    description: 'Seven days of unlimited wing foiling. Your own setup, your own sessions, your own pace.',
    price: 460, duration: 168, disciplineTag: 'wing', rentalSegment: 'standard',
  }),

  // ── Foil — Standard ───────────────────────────────────────────
  rentalSvc({
    name: 'Foil — 1H',
    description: 'Foil board and foil hardware for one hour. Add to a kite rental and start flying.',
    price: 45, duration: 1, disciplineTag: 'kite_foil', rentalSegment: 'standard',
  }),
  rentalSvc({
    name: 'Foil — Half Day',
    description: 'Four hours on the foil — enough time to make serious progress on lift and control.',
    price: 70, duration: 4, disciplineTag: 'kite_foil', rentalSegment: 'standard',
  }),
  rentalSvc({
    name: 'Foil — Full Day',
    description: 'A full day foiling. The silent, fast, high that most kiters eventually come for.',
    price: 90, duration: 8, disciplineTag: 'kite_foil', rentalSegment: 'standard',
  }),
  rentalSvc({
    name: 'Foil — 1 Week',
    description: 'Seven days on the foil. Consistency is how you get good, and a week is how you get consistent.',
    price: 460, duration: 168, disciplineTag: 'kite_foil', rentalSegment: 'standard',
  }),

  // ── Boards ────────────────────────────────────────────────────
  rentalSvc({
    name: 'Board — 1 Day',
    description: 'Just the board. Add to any kite rental — one day, your feet, your pace.',
    price: 30, duration: 8, disciplineTag: 'kite', rentalSegment: 'board',
  }),
  rentalSvc({
    name: 'Board — 1 Week',
    description: 'Seven days with the same board underfoot. Consistency across every session.',
    price: 150, duration: 168, disciplineTag: 'kite', rentalSegment: 'board',
  }),
  rentalSvc({
    name: 'SLS Board / Foil — 1 Day',
    description: 'A premium SLS twin-tip or foil board for the day. High-performance shapes for high-performance riding.',
    price: 38, duration: 8, disciplineTag: 'kite', rentalSegment: 'sls',
  }),
  rentalSvc({
    name: 'SLS Board / Foil — 1 Week',
    description: 'Seven days on premium shapes. The edge you notice most is underfoot.',
    price: 190, duration: 168, disciplineTag: 'kite', rentalSegment: 'sls',
  }),
];

async function seedRentalServices(token) {
  console.log('\n🏄 Rental Services');
  for (const svc of RENTAL_SERVICES) {
    await api('POST', '/services', svc, token);
    log('rental svc', svc.name);
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║      Seed: 2026 Price List — UKC Academy     ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Login
  console.log('🔐 Logging in as admin...');
  const loginRes = await api('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const token = loginRes.token;
  console.log(`   ✅ Logged in as ${loginRes.user?.name || loginRes.user?.email}\n`);

  await wipeAll(token);
  await seedServices(token);
  await seedLessonPackages(token);
  const unitIdMap = await seedAccommodationUnits(token);
  await seedComboPackages(token, unitIdMap);
  await seedMemberOfferings(token);
  await seedRentalServices(token);

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  ✅ SEED COMPLETE — re-run anytime safely     ║');
  console.log('╚══════════════════════════════════════════════╝');
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
