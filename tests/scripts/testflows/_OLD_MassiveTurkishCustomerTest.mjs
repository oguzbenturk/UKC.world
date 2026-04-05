#!/usr/bin/env node
/**
 * Massive Turkish Customer Load Test — 2000 Customers
 *
 * Creates 2000 unique Turkish customers with diverse purchasing patterns
 * spanning EVERY service the platform offers. Lessons are distributed
 * evenly across all 10 instructors.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  CUSTOMER SEGMENTS (2000 total)                                     │
 * │                                                                      │
 * │  A. Individual Lessons Only         — 400 customers  (20%)           │
 * │  B. Lesson Package Buyers           — 400 customers  (20%)           │
 * │  C. All-Inclusive / Accommodation   — 200 customers  (10%)           │
 * │  D. Rental Only                     — 200 customers  (10%)           │
 * │  E. Shop Buyers                     — 200 customers  (10%)           │
 * │  F. Event Participants              — 150 customers  (7.5%)          │
 * │  G. Membership (DPC-Urla)           — 150 customers  (7.5%)          │
 * │  H. Mixed (Package + Shop + Event)  — 200 customers  (10%)           │
 * │  I. Premium (Accommodation+Lesson)  — 100 customers  (5%)            │
 * │                                                                      │
 * │  EXTRAS distributed across segments:                                  │
 * │  - Repair requests: 100 random customers                              │
 * │  - Standalone accommodation bookings: 50 random customers             │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Usage:   node tests/scripts/testflows/MassiveTurkishCustomerTest.mjs
 * Reset:   node tests/scripts/db-reset.mjs --execute
 */

import {
  API, PASSWORD, ADMIN_EMAIL,
  log, ok, fail, title, api, apiOk, adminLogin,
} from '../_shared.mjs';

// ═══════════════════════════════════════════════════════════════════
//  ENTITY IDS (from production DB)
// ═══════════════════════════════════════════════════════════════════

// ── Instructors (10, excluding System Administrator) ───────────────
const INSTRUCTORS = [
  { id: '8a71ef5a-89be-47a5-bc57-0dfef7e65c64', name: 'Ali Kırmızı' },
  { id: '77dfa61f-b433-4b71-b9d8-99d774500262', name: 'Arda Şimşek' },
  { id: '2dd6d117-6e98-4530-9cc9-11432ced8189', name: 'Berke Horasanli' },
  { id: 'bbc10e8e-687a-4c21-a4fd-0a1c8dbefaa7', name: 'Cagan Selcuk Yucel' },
  { id: '1e539cce-8c77-4869-91b9-0e39f7efd4af', name: 'Dinçer Yazgan' },
  { id: 'ba39789a-f957-4125-ac2a-f61fad37b5c4', name: 'Elif Sarı' },
  { id: '9307e939-7c6e-4c6d-b5a6-272a62a3cbde', name: 'Kemal Furkan Doğanlı' },
  { id: '6810a7c8-3655-49eb-8a1d-603f00fadd3f', name: 'Malek Laroussi' },
  { id: '59ab99e9-7165-4bcb-94c3-4bbb1badad11', name: 'Oguzhan Bentürk' },
  { id: 'b18bdec1-b991-48a9-9dc7-0ff81db6ba2e', name: 'Siyabend Şanlı' },
];

// ── Lesson Services (14 total) ─────────────────────────────────────
const LESSON_SERVICES = [
  { id: '63755242-a699-4b74-a7b7-e4d5a404ec67', name: 'Group Kite Foil Lesson', price: 50, cat: 'group', disc: 'kite_foil', max: 2 },
  { id: '65f5471e-ff80-4e7d-8c04-ecf73486178d', name: 'Group Kitesurfing Lesson', price: 50, cat: 'private', disc: 'kite', max: 1 },
  { id: '1e4bbe2e-7363-4dae-bd5b-e1767f8ba7bd', name: 'Group Wingfoil Lesson', price: 50, cat: 'semi-private', disc: 'wing', max: 2 },
  { id: '4327d7ce-02ee-49a2-a97b-40861d2dc372', name: 'Premium Private Kite Lesson', price: 120, cat: 'private', disc: 'premium', max: 1 },
  { id: 'df4d6eb8-7583-4b63-b4d2-8792ec2b3b5f', name: 'Private E-foil Lesson', price: 150, cat: 'private', disc: 'efoil', max: 1 },
  { id: 'd3d039d1-08bd-4004-824c-acb2f72ed37d', name: 'Private Kite Foil Lesson', price: 90, cat: 'private', disc: 'kite_foil', max: 1 },
  { id: 'fa23aa65-8e33-425a-89d0-66436881ec03', name: 'Private Kitesurfing Lesson', price: 90, cat: 'private', disc: 'kite', max: 1 },
  { id: '66eefe3c-271c-44da-afdc-a87a7d97a25d', name: 'Private Supervision Service', price: 60, cat: 'private', disc: 'kite', max: 1 },
  { id: 'fe8fff3b-b543-4cca-a442-95604174281d', name: 'Private Wingfoil Lesson', price: 90, cat: 'private', disc: 'wing', max: 1 },
  { id: '8c9f79f0-1d69-47dd-8229-f598455a58f1', name: 'Semi Private Kite Foil Lesson', price: 60, cat: 'semi-private', disc: 'kite_foil', max: 2 },
  { id: 'ff10e649-1911-42d3-81b5-80f86127645a', name: 'Semi Private Kitesurfing Lesson', price: 60, cat: 'semi-private', disc: 'kite', max: 2 },
  { id: '450799f4-4333-44e2-8fa0-ed6d5b40717e', name: 'Semi Private Premium Lesson', price: 90, cat: 'semi-private', disc: 'premium', max: 2 },
  { id: '1f31a1e3-d16e-47fe-b08e-1c69c0c2f871', name: 'Semi Private Supervision Service', price: 50, cat: 'semi-private', disc: 'kite', max: 2 },
  { id: 'b1164b62-55b9-47fd-a49f-6c7ee1581362', name: 'Semi Private Wingfoil Lesson', price: 60, cat: 'semi-private', disc: 'wing', max: 2 },
];

// ── Private lessons only (for individual bookings) ─────────────────
const PRIVATE_LESSONS = LESSON_SERVICES.filter(s => s.max === 1);
const SEMI_PRIVATE_LESSONS = LESSON_SERVICES.filter(s => s.max === 2);

// ── Service Packages (11 total) ────────────────────────────────────
const PACKAGES = {
  sls_rental:         { id: 'fb1b0860-0a58-4757-82f4-91946a38ff7c', name: '1 Week of Half Day SLS Rental', price: 420, type: 'rental', hours: 0, sessions: 0, rentalDays: 7, accomNights: 0 },
  rider_progression:  { id: '1ebc9b92-d413-490f-8a1a-2c324e93363f', name: '10h – Rider Progression Pack', price: 700, type: 'lesson', hours: 10, sessions: 10, rentalDays: 0, accomNights: 0 },
  starter_6h:         { id: '63caae97-520a-4a19-b8d5-db8bf3cab5c5', name: '6Hours- Starter Package', price: 470, type: 'lesson', hours: 6, sessions: 6, rentalDays: 0, accomNights: 0 },
  group_starter_6h:   { id: 'd70666f9-a0ca-488d-b9c2-86c672670c00', name: '6Hours-Group Starter Pack', price: 280, type: 'lesson', hours: 6, sessions: 6, rentalDays: 0, accomNights: 0 },
  rider_8h:           { id: '22af8b3d-087a-4198-b2bd-7efb7689aae7', name: '8h – Rider Pack', price: 600, type: 'lesson', hours: 8, sessions: 8, rentalDays: 0, accomNights: 0 },
  group_progression:  { id: '5b1e7929-36e7-4980-899b-6f85e2d0c4f3', name: '9Hours – Group Progression Pack', price: 420, type: 'lesson', hours: 9, sessions: 9, rentalDays: 0, accomNights: 0 },
  all_inclusive:      { id: '32ab3bf7-93db-422f-8113-b1150bf5ed64', name: 'All Inclusive Beginner Package', price: 1930, type: 'all_inclusive', hours: 12, sessions: 6, rentalDays: 7, accomNights: 8, lessonServiceId: 'fa23aa65-8e33-425a-89d0-66436881ec03', rentalServiceId: '80cd62e7-f712-4110-807a-c9e459000094' },
  kitesurf_learning:  { id: 'c61ad7d5-29f5-467b-bd97-ba7a54a54571', name: 'Kitesurf Learning Package', price: 1540, type: 'accommodation_lesson', hours: 12, sessions: 6, rentalDays: 0, accomNights: 7, lessonServiceId: 'fa23aa65-8e33-425a-89d0-66436881ec03' },
  downwinder:         { id: '27b0271b-03ef-4a82-b14a-64beae154ee5', name: 'Mordoğan To DPC Urla Downwinder', price: 55, type: 'downwinders', hours: 1, sessions: 1, rentalDays: 0, accomNights: 0 },
  semi_private_10h:   { id: '7c28e424-b463-43d2-b239-470c2741b8c9', name: 'Semi-Private Beginner Pack', price: 550, type: 'lesson', hours: 10, sessions: 5, rentalDays: 0, accomNights: 0 },
  pro_camp:           { id: '7817aa87-f042-4bf9-b7dd-e3c24288963b', name: 'UKC Pro Camp 2', price: 1255, type: 'camps', hours: 10, sessions: 5, rentalDays: 0, accomNights: 3, lessonServiceId: '4327d7ce-02ee-49a2-a97b-40861d2dc372' },
};

// ── Shop Products ──────────────────────────────────────────────────
const SHOP = {
  rebel: { id: '65f2d889-f097-4c08-9bb1-2cfc5f71cb73', name: 'Duotone Rebel D/LAB', price: 3000 },
  wetsuit: { id: '53c3229e-e4b9-42b5-a978-8eeb08f5f39d', name: 'Ion hot shorty wesuit', price: 145 },
};

// ── Events (same IDs as packages for downwinder/camps) ─────────────
const EVENTS = {
  downwinder: { id: '27b0271b-03ef-4a82-b14a-64beae154ee5', name: 'Mordoğan To DPC Urla Downwinder', price: 55, max: 16 },
  pro_camp:   { id: '7817aa87-f042-4bf9-b7dd-e3c24288963b', name: 'UKC Pro Camp 2', price: 1255, max: 20 },
};

// ── Member Offerings ───────────────────────────────────────────────
const MEMBERSHIPS = {
  daily:    { id: 10, name: 'Entrance of DPC-Urla - Daily', price: 10 },
  weekly:   { id: 11, name: 'Entrance of DPC-Urla - Weekly', price: 60 },
  monthly:  { id: 12, name: 'Entrance of DPC-Urla - Monthly', price: 180 },
  seasonal: { id: 13, name: 'Entrance of DPC-Urla - Seasonal', price: 300 },
};

// ── Accommodation Units ────────────────────────────────────────────
const ACCOM_UNITS = [
  { id: '023fc831-9f0e-49fd-a277-4f88064238f1', name: 'Burlahan Hotel Standart Room', price: 120 },
  { id: 'e5061102-01cd-4b62-9498-36f4a9c67ad2', name: 'Farm Studio House', price: 70 },
];

// ── Rental Equipment Services ──────────────────────────────────────
const RENTAL_SERVICES = [
  { id: 'fb10d3db-1a50-4cdd-960c-0851c2f7836e', name: '1H - D/LAB', price: 48 },
  { id: '98652e7a-7df3-4ff1-8f1f-c1f080f2a170', name: '1H - SLS', price: 40 },
  { id: 'f8322e81-9396-4fec-8bda-81ec2dcc3414', name: '1H - Standard', price: 35 },
  { id: 'e951db65-ae9c-4170-a2f8-22795862edbc', name: '4H - D/LAB', price: 75 },
  { id: '93dba16f-bed5-4e08-826e-1e114c0faad0', name: '4H - SLS', price: 65 },
  { id: '80cd62e7-f712-4110-807a-c9e459000094', name: '4H - Standard', price: 55 },
  { id: '32c0410c-de88-46b0-ba19-aaa74175bd8c', name: '8H - D/LAB', price: 95 },
  { id: 'a4a2188d-6951-449d-ae47-53c59dc3bcd4', name: '8H - SLS', price: 85 },
  { id: '15df7631-d620-427d-ba98-0e462e4cc7c5', name: '8H - Standard', price: 75 },
];

// ═══════════════════════════════════════════════════════════════════
//  TURKISH NAME GENERATOR
// ═══════════════════════════════════════════════════════════════════

const FIRST_NAMES_M = [
  'Ahmet','Ali','Alp','Arda','Ayhan','Barış','Berat','Burak','Can','Cem',
  'Cenk','Cihan','Çağrı','Deniz','Doğan','Doruk','Ege','Efe','Emir','Emre',
  'Enes','Engin','Erdem','Eren','Erhan','Erkan','Erol','Ersin','Fatih','Ferhat',
  'Fikret','Furkan','Gökhan','Güney','Hakan','Halil','Hasan','Hikmet','Hüseyin','İlker',
  'İsmail','Kaan','Kamil','Kemal','Kerem','Koray','Levent','Mahir','Mehmet','Melih',
  'Mert','Mesut','Mete','Murat','Mustafa','Necati','Nuri','Onur','Oğuz','Okan',
  'Orhan','Osman','Özgür','Polat','Ramazan','Recep','Rıza','Samet','Selçuk','Selim',
  'Semih','Sercan','Serhat','Serkan','Sinan','Soner','Şahin','Tahir','Taner','Tarik',
  'Taylan','Tolga','Tufan','Tuncay','Turan','Uğur','Umut','Utku','Volkan','Yavuz',
  'Yiğit','Yunus','Yusuf','Zafer','Berk','Çağlar','Gürkan','İbrahim','Şükrü','Turgut',
];

const FIRST_NAMES_F = [
  'Aslı','Ayça','Aylin','Aysel','Ayşe','Başak','Belgin','Berna','Betül','Burcu',
  'Cansu','Cemre','Çiğdem','Damla','Defne','Deniz','Derya','Dilan','Dilek','Ebru',
  'Ece','Ekin','Ela','Elif','Emine','Esra','Eylem','Ezgi','Fatma','Funda',
  'Gamze','Gizem','Gökçe','Güliz','Gülşen','Hande','Havva','Hazal','Hilal','Hülya',
  'Irem','İdil','İlknur','İpek','Kader','Lale','Melek','Meltem','Merve','Melike',
  'Mine','Müge','Naz','Nazlı','Neslihan','Nihal','Nil','Nisa','Nur','Özge',
  'Özlem','Pelin','Pınar','Rabia','Rüya','Seda','Selin','Serap','Sevgi','Sibel',
  'Simge','Sinem','Şebnem','Şule','Tomris','Tuba','Tuğba','Tülay','Ülkü','Yasemin',
  'Yeşim','Yıldız','Zehra','Zeynep','Zülal','Açelya','Bade','Ceren','Duygu','Fulya',
  'Gönül','Helin','İnci','Kadriye','Leman','Nermin','Perihan','Serpil','Şeyda','Zübeyde',
];

const LAST_NAMES = [
  'Yılmaz','Kaya','Demir','Çelik','Şahin','Yıldız','Yıldırım','Öztürk','Aydın','Özdemir',
  'Arslan','Doğan','Kılıç','Aslan','Çetin','Kara','Koç','Kurt','Özkan','Şimşek',
  'Polat','Korkmaz','Çakır','Erdoğan','Akar','Bulut','Güneş','Aksoy','Kaplan','Aktaş',
  'Bayrak','Bozkurt','Durmaz','Taş','Güler','Uçar','Yavuz','Avcı','Tekin','Ateş',
  'Altın','Başar','Coşkun','Duman','Erdem','Fidan','Genç','Güngör','Işık','Karaca',
  'Köse','Mutlu','Öz','Pala','Sarı','Toprak','Tümer','Uysal','Vardar','Yaşar',
  'Zengin','Akgül','Baran','Candan','Dağlı','Elmas','Gül','Hakim','İnan','Kaptan',
  'Bayram','Tanrıverdi','Sezer','Ulusoy','Soyer','Ergün','Albayrak','Tuncer','Ergin','Aras',
  'Turan','Karadağ','Yüksel','Alkan','Çakmak','Eroğlu','Peker','Dinç','Soylu','Türker',
  'Aksu','Bıçak','Cengiz','Durmuş','Ekinci','Fevzi','Gencer','Hatipoğlu','İlhan','Kabak',
];

const CITIES = [
  'Istanbul','Ankara','Izmir','Antalya','Bursa','Konya','Adana','Gaziantep',
  'Mersin','Kayseri','Eskişehir','Trabzon','Samsun','Muğla','Bodrum','Çeşme',
  'Kuşadası','Fethiye','Marmaris','Alaçatı','Urla','Dikili','Ayvalık','Datça',
  'Kaş','Kalkan','Didim','Altınoluk','Assos','Akyaka','Gökçeada','Bozcaada',
];

function generateProfile(index) {
  const isFemale = index % 2 === 1;
  const names = isFemale ? FIRST_NAMES_F : FIRST_NAMES_M;
  const firstName = names[index % names.length];
  const lastName = LAST_NAMES[Math.floor(index / 2) % LAST_NAMES.length];
  // Ensure unique email by appending index
  const emailBase = `${firstName.toLowerCase().replace(/[çğıöşü]/g, c => ({ç:'c',ğ:'g',ı:'i',ö:'o',ş:'s',ü:'u'})[c] || c)}.${lastName.toLowerCase().replace(/[çğıöşü]/g, c => ({ç:'c',ğ:'g',ı:'i',ö:'o',ş:'s',ü:'u'})[c] || c)}`;
  const email = `${emailBase}${index}@testmail.com`;
  const phone = `+9053${String(10000000 + index).slice(-8)}`;
  const year = 1975 + (index % 30);
  const month = String(1 + (index % 12)).padStart(2, '0');
  const day = String(1 + (index % 28)).padStart(2, '0');
  const weight = 50 + (index % 50);
  const city = CITIES[index % CITIES.length];

  return {
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    date_of_birth: `${year}-${month}-${day}`,
    weight,
    city,
    country: 'Turkey',
    preferred_currency: index % 5 === 0 ? 'TRY' : 'EUR',
  };
}

// ═══════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════

function offsetDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}
const todayStr = offsetDate(0);

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

/**
 * Time distribution for realistic data:
 *  - 40% past (completed)  → -90 to -1 days
 *  - 10% today (active)    →  0 days
 *  - 50% future (upcoming) → +1 to +120 days
 */
function timeSlot(index) {
  const bucket = index % 10;
  if (bucket < 4) {
    // past: -90 … -1
    const day = -90 + (index * 7) % 90;  // spread across last 90 days
    return { dayOffset: day, temporal: 'past' };
  } else if (bucket < 5) {
    // today
    return { dayOffset: 0, temporal: 'today' };
  } else {
    // future: 1 … 120
    const day = 1 + (index * 3) % 120;
    return { dayOffset: day, temporal: 'future' };
  }
}

let instructorIdx = 0;
function nextInstructor() {
  const inst = INSTRUCTORS[instructorIdx % INSTRUCTORS.length];
  instructorIdx++;
  return inst;
}

// Timeout-aware API wrapper (30s timeout, 2 retries)
async function apiT(method, path, body, token, timeoutMs = 15000) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const url = `${API}${path}`;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const opts = { method, headers, signal: controller.signal };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(url, opts);
      clearTimeout(timer);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      return { status: res.status, ok: res.ok, data };
    } catch (e) {
      if (attempt === 1) throw new Error(`${method} ${path} timed out after 2 attempts`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function createUser(profile, roleId, token) {
  const res = await apiT('POST', '/users', { ...profile, password: PASSWORD, role_id: roleId }, token);
  if (res.ok) return res.data.id || res.data.user?.id;
  if (res.status === 409) {
    const lookupRes = await apiT('GET', `/users?search=${encodeURIComponent(profile.email)}`, null, token);
    if (!lookupRes.ok) throw new Error(`User lookup failed: ${lookupRes.status}`);
    const users = Array.isArray(lookupRes.data) ? lookupRes.data : lookupRes.data.users || lookupRes.data.data || [];
    const found = users.find(u => u.email === profile.email);
    if (found) return found.id;
    throw new Error(`User ${profile.email} exists but lookup failed`);
  }
  throw new Error(`POST /users → ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
}

async function fundWallet(userId, amount, token) {
  await apiOk('POST', '/wallet/manual-adjust', {
    userId, amount, currency: 'EUR', description: 'Massive test funding',
  }, token);
}

// Batch user creation with concurrency control
async function batchCreate(profiles, roleId, token, concurrency = 10) {
  const results = [];
  for (let i = 0; i < profiles.length; i += concurrency) {
    const batch = profiles.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (p) => {
        const userId = await createUser(p, roleId, token);
        return { ...p, userId };
      })
    );
    for (const r of batchResults) {
      if (r.status === 'fulfilled') results.push(r.value);
      else log(`    ⚠ user create failed: ${r.reason?.message?.slice(0, 100)}`);
    }
    if (i % 50 === 0 && i > 0) log(`    ... created ${results.length}/${profiles.length} users`);
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════
//  SEGMENT ACTIONS
// ═══════════════════════════════════════════════════════════════════

// Complete a past booking
async function completeBooking(bookingId, token) {
  try { await apiOk('PUT', `/bookings/${bookingId}`, { status: 'completed' }, token); } catch { /* ok */ }
}

// A: Individual private lesson (no package)
async function bookIndividualLesson(userId, token, slot) {
  const service = pick(PRIVATE_LESSONS);
  const inst = nextInstructor();
  const dateStr = offsetDate(slot.dayOffset);
  const startHour = 8 + Math.floor(Math.random() * 9); // 8–16
  const status = slot.temporal === 'past' ? 'confirmed' : 'confirmed';
  try {
    const booking = await apiOk('POST', '/bookings?force=true', {
      date: dateStr,
      start_hour: `${startHour}.00`,
      duration: 1,
      student_user_id: userId,
      instructor_user_id: inst.id,
      service_id: service.id,
      status,
    }, token);
    const bId = booking.id || booking.booking?.id;
    // Mark past bookings as completed
    if (bId && slot.temporal === 'past') await completeBooking(bId, token);
    return { id: bId, temporal: slot.temporal };
  } catch (e) {
    // Time conflict — try adjacent day
    try {
      const booking = await apiOk('POST', '/bookings?force=true', {
        date: offsetDate(slot.dayOffset + (slot.temporal === 'past' ? -1 : 1)),
        start_hour: `${startHour}.00`,
        duration: 1,
        student_user_id: userId,
        instructor_user_id: inst.id,
        service_id: service.id,
        status,
      }, token);
      const bId = booking.id || booking.booking?.id;
      if (bId && slot.temporal === 'past') await completeBooking(bId, token);
      return { id: bId, temporal: slot.temporal };
    } catch { return null; }
  }
}

// B: Purchase a lesson package
async function purchaseLessonPackage(userId, token) {
  const pkgOptions = [
    PACKAGES.rider_progression,
    PACKAGES.starter_6h,
    PACKAGES.rider_8h,
    PACKAGES.group_starter_6h,
    PACKAGES.group_progression,
    PACKAGES.semi_private_10h,
  ];
  const pkg = pick(pkgOptions);
  const res = await apiOk('POST', '/services/customer-packages', {
    customerId: userId,
    servicePackageId: pkg.id,
    packageName: pkg.name,
    totalHours: pkg.hours,
    purchasePrice: pkg.price,
    currency: 'EUR',
    includesLessons: true,
    includesRental: false,
    includesAccommodation: false,
    packageType: pkg.type,
  }, token);
  return { cpId: res.id, pkg };
}

// Book lessons against a package (with past/today/future distribution)
async function bookPackageLessons(userId, cpId, pkg, token, baseSlot) {
  const inst = nextInstructor();
  const service = pick(PRIVATE_LESSONS);
  const sessionsCount = Math.min(pkg.sessions || 3, 3);
  let completed = 0;
  for (let i = 0; i < sessionsCount; i++) {
    const dayOff = baseSlot.dayOffset + i * 2;
    const dateStr = offsetDate(dayOff);
    const isPast = dayOff < 0;
    try {
      const b = await apiOk('POST', '/bookings?force=true', {
        date: dateStr,
        start_hour: `${9 + i}.00`,
        duration: 1,
        student_user_id: userId,
        instructor_user_id: inst.id,
        service_id: service.id,
        status: 'confirmed',
        use_package: true,
        customer_package_id: cpId,
      }, token);
      const bId = b.id || b.booking?.id;
      if (bId && isPast) { await completeBooking(bId, token); completed++; }
    } catch { /* skip conflicts */ }
  }
  return completed;
}

// C: All-Inclusive package purchase
async function purchaseAllInclusive(userId, token) {
  const pkg = PACKAGES.all_inclusive;
  const unit = pick(ACCOM_UNITS);
  const res = await apiOk('POST', '/services/customer-packages', {
    customerId: userId,
    servicePackageId: pkg.id,
    packageName: pkg.name,
    totalHours: pkg.hours,
    purchasePrice: pkg.price,
    currency: 'EUR',
    includesLessons: true,
    includesRental: true,
    includesAccommodation: true,
    packageType: 'all_inclusive',
    rentalDays: pkg.rentalDays,
    accommodationNights: pkg.accomNights,
    accommodationUnitId: unit.id,
  }, token);
  return res.id;
}

// D: Create standalone rental (past rentals get completed)
async function createRental(userId, token, slot) {
  const equip = pick(RENTAL_SERVICES);
  const startDate = offsetDate(slot.dayOffset);
  const endDate = offsetDate(slot.dayOffset + 1);
  try {
    const rental = await apiOk('POST', '/rentals', {
      user_id: userId,
      equipment_ids: [equip.id],
      rental_days: 1,
      start_date: startDate,
      end_date: endDate,
      payment_method: 'wallet',
    }, token);
    const rId = rental.id || rental.rental?.id;
    if (rId) {
      try { await apiOk('PATCH', `/rentals/${rId}/activate`, null, token); } catch { /* ok */ }
      if (slot.temporal === 'past') {
        try { await apiOk('PATCH', `/rentals/${rId}/complete`, null, token); } catch { /* ok */ }
      }
    }
    return rId;
  } catch { return null; }
}

// E: Create shop order
async function createShopOrder(userId, userToken) {
  const product = pick([SHOP.rebel, SHOP.wetsuit]);
  const sizes = product === SHOP.rebel ? ['5m', '7m', '9m', '10m'] : ['S', 'M', 'L', 'XL'];
  const size = pick(sizes);
  try {
    const order = await apiOk('POST', '/shop-orders', {
      items: [{
        product_id: product.id,
        quantity: 1,
        selected_size: size,
        selected_variant: { label: size, price: product.price },
      }],
      payment_method: 'wallet',
      notes: `Test bulk order — ${product.name} (${size})`,
    }, userToken);
    return (order.order || order).id;
  } catch { return null; }
}

// F: Event registration (via package purchase for events that are packages)
async function purchaseEventPackage(userId, token) {
  const event = pick([PACKAGES.downwinder, PACKAGES.pro_camp]);
  try {
    const res = await apiOk('POST', '/services/customer-packages', {
      customerId: userId,
      servicePackageId: event.id,
      packageName: event.name,
      totalHours: event.hours,
      purchasePrice: event.price,
      currency: 'EUR',
      includesLessons: event.hours > 0,
      includesRental: event.rentalDays > 0,
      includesAccommodation: event.accomNights > 0,
      packageType: event.type,
    }, token);
    return res.id;
  } catch { return null; }
}

// G: Membership purchase
async function purchaseMembership(userId, userToken) {
  const membership = pick([MEMBERSHIPS.daily, MEMBERSHIPS.weekly, MEMBERSHIPS.monthly, MEMBERSHIPS.seasonal]);
  try {
    const res = await apiOk('POST', `/member-offerings/${membership.id}/purchase`, {
      paymentMethod: 'wallet',
    }, userToken);
    return res.purchase?.id || res.id;
  } catch { return null; }
}

// Repair request
async function submitRepairRequest(userToken) {
  const types = ['kite', 'bar', 'board', 'harness', 'wetsuit'];
  const items = ['Duotone Rebel 9m', 'Core XR7 12m', 'Cabrinha Switchblade 10m', 'North Orbit 8m', 'Naish Pivot 11m'];
  const descriptions = [
    'Torn canopy near the center strut, approximately 15cm tear.',
    'Broken leading edge bladder — leaking air after hard crash.',
    'Depower line shows signs of wear and may snap.',
    'Zipper stuck and won\'t close properly.',
    'Footstrap screws stripped, needs re-threading.',
  ];
  try {
    await apiOk('POST', '/repair-requests', {
      equipmentType: pick(types),
      itemName: pick(items),
      description: pick(descriptions),
      priority: pick(['low', 'medium', 'high']),
    }, userToken);
  } catch { /* ok */ }
}

// Standalone accommodation booking (past/today/future)
async function createAccommodationBooking(userId, token, slot) {
  const unit = pick(ACCOM_UNITS);
  const checkIn = offsetDate(slot.dayOffset);
  const checkOut = offsetDate(slot.dayOffset + 3);
  try {
    const booking = await apiOk('POST', '/accommodation/bookings', {
      unit_id: unit.id,
      check_in_date: checkIn,
      check_out_date: checkOut,
      guests_count: 1,
      guest_id: userId,
      payment_method: 'wallet',
    }, token);
    const bId = booking.id;
    try { await apiOk('PATCH', `/accommodation/bookings/${bId}/confirm`, null, token); } catch { /* ok */ }
    if (bId && slot.temporal === 'past') {
      try { await apiOk('PATCH', `/accommodation/bookings/${bId}/checkout`, null, token); } catch { /* ok */ }
    }
    return bId;
  } catch { return null; }
}

// I: Accommodation + Lesson package (Kitesurf Learning Package)
async function purchaseAccomLessonPkg(userId, token) {
  const pkg = PACKAGES.kitesurf_learning;
  const unit = pick(ACCOM_UNITS);
  try {
    const res = await apiOk('POST', '/services/customer-packages', {
      customerId: userId,
      servicePackageId: pkg.id,
      packageName: pkg.name,
      totalHours: pkg.hours,
      purchasePrice: pkg.price,
      currency: 'EUR',
      includesLessons: true,
      includesRental: false,
      includesAccommodation: true,
      packageType: 'accommodation_lesson',
      accommodationNights: pkg.accomNights,
      accommodationUnitId: unit.id,
    }, token);
    return res.id;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════

const TOTAL_CUSTOMERS = 2000;

const SEGMENT_SIZES = {
  A: 400,  // Individual lessons
  B: 400,  // Lesson packages
  C: 200,  // All-inclusive / accommodation
  D: 200,  // Rental only
  E: 200,  // Shop buyers
  F: 150,  // Events
  G: 150,  // Membership
  H: 200,  // Mixed
  I: 100,  // Premium accommodation+lesson
};

(async () => {
  const startTime = Date.now();
  const stats = { users: 0, lessons: 0, completedLessons: 0, packages: 0, rentals: 0, shopOrders: 0, events: 0, memberships: 0, repairs: 0, accommodations: 0, errors: 0 };

  try {
    // ── Phase 1: Admin login & role lookup ──────────────────────
    title('Phase 1 · Admin Login');
    const token = await adminLogin();
    ok('Admin logged in');

    const roles = await apiOk('GET', '/roles', null, token);
    const studentRole = (Array.isArray(roles) ? roles : roles.roles || []).find(r => r.name === 'student');
    if (!studentRole) throw new Error('Student role not found');
    ok(`Student role: ${studentRole.id}`);

    // ── Phase 2: Generate all 2000 profiles ─────────────────────
    title('Phase 2 · Generate 2000 Turkish Customer Profiles');
    const allProfiles = [];
    for (let i = 0; i < TOTAL_CUSTOMERS; i++) {
      allProfiles.push(generateProfile(i));
    }
    ok(`Generated ${allProfiles.length} profiles`);

    // ── Phase 3: Create users in batches ────────────────────────
    title('Phase 3 · Create Users & Fund Wallets');
    const allUsers = await batchCreate(allProfiles, studentRole.id, token, 10);
    stats.users = allUsers.length;
    ok(`Created ${allUsers.length} users`);

    // Fund wallets — most get modest amounts, premium segments get more
    log('  Funding wallets...');
    let offset = 0;
    const segA = allUsers.slice(offset, offset += SEGMENT_SIZES.A); // individual lessons
    const segB = allUsers.slice(offset, offset += SEGMENT_SIZES.B); // packages
    const segC = allUsers.slice(offset, offset += SEGMENT_SIZES.C); // all-inclusive
    const segD = allUsers.slice(offset, offset += SEGMENT_SIZES.D); // rental
    const segE = allUsers.slice(offset, offset += SEGMENT_SIZES.E); // shop
    const segF = allUsers.slice(offset, offset += SEGMENT_SIZES.F); // events
    const segG = allUsers.slice(offset, offset += SEGMENT_SIZES.G); // membership
    const segH = allUsers.slice(offset, offset += SEGMENT_SIZES.H); // mixed
    const segI = allUsers.slice(offset, offset += SEGMENT_SIZES.I); // premium

    // Fund by segment (batch in groups of 20)
    async function fundSegment(seg, amount) {
      for (let i = 0; i < seg.length; i += 20) {
        const batch = seg.slice(i, i + 20);
        await Promise.all(batch.map(u => fundWallet(u.userId, amount, token)));
      }
    }

    await fundSegment(segA, 500);    // Individual lessons: enough for ~5 lessons
    ok(`  Segment A (${segA.length}) funded: €500 each`);
    await fundSegment(segB, 1000);   // Package buyers
    ok(`  Segment B (${segB.length}) funded: €1000 each`);
    await fundSegment(segC, 2500);   // All-inclusive
    ok(`  Segment C (${segC.length}) funded: €2500 each`);
    await fundSegment(segD, 300);    // Rental only
    ok(`  Segment D (${segD.length}) funded: €300 each`);
    await fundSegment(segE, 4000);   // Shop buyers (kite is €3000)
    ok(`  Segment E (${segE.length}) funded: €4000 each`);
    await fundSegment(segF, 1500);   // Events
    ok(`  Segment F (${segF.length}) funded: €1500 each`);
    await fundSegment(segG, 400);    // Membership
    ok(`  Segment G (${segG.length}) funded: €400 each`);
    await fundSegment(segH, 3000);   // Mixed
    ok(`  Segment H (${segH.length}) funded: €3000 each`);
    await fundSegment(segI, 2000);   // Premium
    ok(`  Segment I (${segI.length}) funded: €2000 each`);

    // ── Phase 4: Segment A — Individual Lessons ─────────────────
    title(`Phase 4 · Segment A — Individual Lessons (${segA.length} customers)`);
    let pastLessons = 0, todayLessons = 0, futureLessons = 0;
    for (let i = 0; i < segA.length; i++) {
      const u = segA[i];
      const slot = timeSlot(i);
      const result = await bookIndividualLesson(u.userId, token, slot);
      if (result?.id) {
        stats.lessons++;
        if (result.temporal === 'past') { pastLessons++; stats.completedLessons++; }
        else if (result.temporal === 'today') todayLessons++;
        else futureLessons++;
      } else stats.errors++;
      if (i % 100 === 0 && i > 0) log(`    ... ${i}/${segA.length}`);
    }
    ok(`Booked ${stats.lessons} individual lessons (past:${pastLessons} today:${todayLessons} future:${futureLessons})`);

    // ── Phase 5: Segment B — Lesson Packages ────────────────────
    title(`Phase 5 · Segment B — Lesson Packages (${segB.length} customers)`);
    let pkgCount = 0, pkgCompleted = 0;
    for (let i = 0; i < segB.length; i++) {
      const u = segB[i];
      try {
        const { cpId, pkg } = await purchaseLessonPackage(u.userId, token);
        stats.packages++;
        pkgCount++;
        const slot = timeSlot(i);
        const completed = await bookPackageLessons(u.userId, cpId, pkg, token, slot);
        pkgCompleted += completed;
        stats.completedLessons += completed;
        stats.lessons += Math.min(pkg.sessions || 3, 3);
      } catch {
        stats.errors++;
      }
      if (i % 100 === 0 && i > 0) log(`    ... ${i}/${segB.length}`);
    }
    ok(`${pkgCount} packages purchased, lessons booked (${pkgCompleted} completed)`);

    // ── Phase 6: Segment C — All-Inclusive ───────────────────────
    title(`Phase 6 · Segment C — All-Inclusive (${segC.length} customers)`);
    let aiCount = 0;
    for (let i = 0; i < segC.length; i++) {
      const u = segC[i];
      try {
        await purchaseAllInclusive(u.userId, token);
        stats.packages++;
        aiCount++;
      } catch { stats.errors++; }
      if (i % 50 === 0 && i > 0) log(`    ... ${i}/${segC.length}`);
    }
    ok(`${aiCount} All-Inclusive packages purchased`);

    // ── Phase 7: Segment D — Rental Only ────────────────────────
    title(`Phase 7 · Segment D — Rentals (${segD.length} customers)`);
    for (let i = 0; i < segD.length; i++) {
      const u = segD[i];
      const slot = timeSlot(i);
      const rId = await createRental(u.userId, token, slot);
      if (rId) stats.rentals++;
      else stats.errors++;
      if (i % 50 === 0 && i > 0) log(`    ... ${i}/${segD.length}`);
    }
    ok(`${stats.rentals} rentals created (mixed past/today/future)`);

    // ── Phase 8: Segment E — Shop Buyers ────────────────────────
    title(`Phase 8 · Segment E — Shop Buyers (${segE.length} customers)`);
    // Need user tokens for shop orders  
    for (let i = 0; i < segE.length; i++) {
      const u = segE[i];
      try {
        const userToken = (await apiOk('POST', '/auth/login', { email: u.email, password: PASSWORD })).token;
        const orderId = await createShopOrder(u.userId, userToken);
        if (orderId) stats.shopOrders++;
        else stats.errors++;
      } catch { stats.errors++; }
      if (i % 50 === 0 && i > 0) log(`    ... ${i}/${segE.length}`);
    }
    ok(`${stats.shopOrders} shop orders placed`);

    // ── Phase 9: Segment F — Event Participants ─────────────────
    title(`Phase 9 · Segment F — Events (${segF.length} customers)`);
    for (let i = 0; i < segF.length; i++) {
      const u = segF[i];
      const id = await purchaseEventPackage(u.userId, token);
      if (id) stats.events++;
      else stats.errors++;
      if (i % 50 === 0 && i > 0) log(`    ... ${i}/${segF.length}`);
    }
    ok(`${stats.events} event packages purchased`);

    // ── Phase 10: Segment G — Memberships ───────────────────────
    title(`Phase 10 · Segment G — Memberships (${segG.length} customers)`);
    for (let i = 0; i < segG.length; i++) {
      const u = segG[i];
      try {
        const userToken = (await apiOk('POST', '/auth/login', { email: u.email, password: PASSWORD })).token;
        const id = await purchaseMembership(u.userId, userToken);
        if (id) stats.memberships++;
        else stats.errors++;
      } catch { stats.errors++; }
      if (i % 50 === 0 && i > 0) log(`    ... ${i}/${segG.length}`);
    }
    ok(`${stats.memberships} memberships purchased`);

    // ── Phase 11: Segment H — Mixed (Package + Shop + Event) ────
    title(`Phase 11 · Segment H — Mixed (${segH.length} customers)`);
    for (let i = 0; i < segH.length; i++) {
      const u = segH[i];
      try {
        // Buy a lesson package
        const { cpId, pkg } = await purchaseLessonPackage(u.userId, token);
        stats.packages++;
        const slot = timeSlot(i);
        await bookPackageLessons(u.userId, cpId, pkg, token, slot);
        stats.lessons += Math.min(pkg.sessions || 3, 3);

        // Shop order
        const userToken = (await apiOk('POST', '/auth/login', { email: u.email, password: PASSWORD })).token;
        const orderId = await createShopOrder(u.userId, userToken);
        if (orderId) stats.shopOrders++;

        // Event package
        const eventId = await purchaseEventPackage(u.userId, token);
        if (eventId) stats.events++;
      } catch { stats.errors++; }
      if (i % 50 === 0 && i > 0) log(`    ... ${i}/${segH.length}`);
    }
    ok(`Segment H completed (mixed purchases)`);

    // ── Phase 12: Segment I — Premium Accommodation+Lesson ──────
    title(`Phase 12 · Segment I — Premium (${segI.length} customers)`);
    for (let i = 0; i < segI.length; i++) {
      const u = segI[i];
      const cpId = await purchaseAccomLessonPkg(u.userId, token);
      if (cpId) stats.packages++;
      else stats.errors++;
      if (i % 50 === 0 && i > 0) log(`    ... ${i}/${segI.length}`);
    }
    ok(`${segI.length} accommodation+lesson packages purchased`);

    // ── Phase 13: Cross-segment extras ──────────────────────────
    title('Phase 13 · Cross-Segment Extras');

    // 100 repair requests across random customers
    log('  Submitting 100 repair requests...');
    const repairCustomers = pickN(allUsers, 100);
    for (const u of repairCustomers) {
      try {
        const userToken = (await apiOk('POST', '/auth/login', { email: u.email, password: PASSWORD })).token;
        await submitRepairRequest(userToken);
        stats.repairs++;
      } catch { stats.errors++; }
    }
    ok(`${stats.repairs} repair requests submitted`);

    // 50 standalone accommodation bookings
    log('  Creating 50 standalone accommodation bookings...');
    const accomCustomers = pickN(allUsers, 50);
    for (let i = 0; i < accomCustomers.length; i++) {
      const u = accomCustomers[i];
      const slot = timeSlot(i);
      const bId = await createAccommodationBooking(u.userId, token, slot);
      if (bId) stats.accommodations++;
      else stats.errors++;
    }
    ok(`${stats.accommodations} standalone accommodation bookings (mixed past/today/future)`);

    // ── Phase 14: Summary ───────────────────────────────────────
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    title('✅ COMPLETE — Massive Turkish Customer Test');
    log(`\n  Duration: ${elapsed}s`);
    log(`  ──────────────────────────────────────`);
    log(`  Users created:        ${stats.users}`);
    log(`  Total lessons:        ${stats.lessons} (${stats.completedLessons} completed)`);
    log(`  Packages purchased:   ${stats.packages}`);
    log(`  Rentals created:      ${stats.rentals}`);
    log(`  Shop orders placed:   ${stats.shopOrders}`);
    log(`  Event packages:       ${stats.events}`);
    log(`  Memberships:          ${stats.memberships}`);
    log(`  Repair requests:      ${stats.repairs}`);
    log(`  Accommodation bookings: ${stats.accommodations}`);
    log(`  Errors (skipped):     ${stats.errors}`);
    log(`  ──────────────────────────────────────`);
    log(`  Total actions:        ${Object.values(stats).reduce((a, b) => a + b, 0) - stats.errors - stats.users}`);
    log('');

  } catch (err) {
    fail(`FATAL: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
})();
