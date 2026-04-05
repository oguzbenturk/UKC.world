/**
 * Shared constants and helpers for functionality tests.
 * Both booking-flow.mjs and cleanup.mjs import from here
 * so they stay in sync.
 */

// ── Config ─────────────────────────────────────────────────────────
export const API      = process.env.API_URL || 'http://localhost:4000/api';
export const PASSWORD = 'asdasd35';
export const ADMIN_EMAIL = 'admin@plannivo.com';

// ── Test Profiles (German) ─────────────────────────────────────────
export const PROFILES = [
  { first_name: 'Lukas',      last_name: 'Hoffmann',  email: 'lukas.hoffmann87@gmail.com',  phone: '+4917612345678', date_of_birth: '1987-04-12', weight: 78, city: 'Hamburg',   country: 'Germany', preferred_currency: 'EUR' },
  { first_name: 'Sophie',     last_name: 'Müller',    email: 'sophie.mueller92@gmail.com',   phone: '+4915901234567', date_of_birth: '1992-08-03', weight: 62, city: 'Berlin',   country: 'Germany', preferred_currency: 'EUR' },
  { first_name: 'Tobias',     last_name: 'Schneider', email: 'tobias.schneider85@gmail.com', phone: '+4916098765432', date_of_birth: '1985-11-22', weight: 82, city: 'Munich',   country: 'Germany', preferred_currency: 'EUR' },
  { first_name: 'Laura',      last_name: 'Fischer',   email: 'laura.fischer95@gmail.com',    phone: '+4917623456789', date_of_birth: '1995-02-17', weight: 58, city: 'Cologne',  country: 'Germany', preferred_currency: 'EUR' },
  { first_name: 'Maximilian', last_name: 'Weber',     email: 'max.weber1990@gmail.com',      phone: '+4915112345678', date_of_birth: '1990-06-30', weight: 85, city: 'Frankfurt', country: 'Germany', preferred_currency: 'EUR' },
];

// ── Test Profiles (Turkish) ────────────────────────────────────────
export const TURKISH_PROFILES = [
  { first_name: 'Emre',   last_name: 'Yilmaz',   email: 'emre.yilmaz91@gmail.com',   phone: '+905321234567', date_of_birth: '1991-03-15', weight: 80, city: 'Istanbul',  country: 'Turkey', preferred_currency: 'TRY' },
  { first_name: 'Selin',  last_name: 'Kaya',      email: 'selin.kaya88@gmail.com',    phone: '+905339876543', date_of_birth: '1988-07-22', weight: 58, city: 'Izmir',     country: 'Turkey', preferred_currency: 'TRY' },
  { first_name: 'Burak',  last_name: 'Demir',     email: 'burak.demir93@gmail.com',   phone: '+905441237890', date_of_birth: '1993-11-08', weight: 85, city: 'Antalya',   country: 'Turkey', preferred_currency: 'TRY' },
  { first_name: 'Merve',  last_name: 'Celik',     email: 'merve.celik90@gmail.com',   phone: '+905057654321', date_of_birth: '1990-01-30', weight: 60, city: 'Ankara',    country: 'Turkey', preferred_currency: 'TRY' },
  { first_name: 'Kaan',   last_name: 'Ozdemir',   email: 'kaan.ozdemir86@gmail.com',  phone: '+905461239876', date_of_birth: '1986-09-05', weight: 78, city: 'Bodrum',    country: 'Turkey', preferred_currency: 'TRY' },
];

// ── Service / Package IDs ──────────────────────────────────────────
export const ELIF_ID                   = 'ba39789a-f957-4125-ac2a-f61fad37b5c4';
export const SIYABEND_ID               = 'b18bdec1-b991-48a9-9dc7-0ff81db6ba2e';
export const OGUZHAN_ID                = '59ab99e9-7165-4bcb-94c3-4bbb1badad11';

export const PKG_SERVICE_PACKAGE_ID    = '1ebc9b92-d413-490f-8a1a-2c324e93363f';
export const PKG_NAME                  = '10h – Rider Progression Pack';
export const PKG_PRICE                 = 700;
export const PKG_TOTAL_HOURS           = 10;
export const PRIVATE_LESSON_SERVICE_ID = 'fa23aa65-8e33-425a-89d0-66436881ec03';
export const PRIVATE_LESSON_PRICE      = 90;

// Kitesurf Learning Package (12 h lessons + 7 nights accommodation)
export const KITESURF_PKG_ID           = 'c61ad7d5-29f5-467b-bd97-ba7a54a54571';
export const KITESURF_PKG_NAME         = 'Kitesurf Learning Package';
export const KITESURF_PKG_PRICE        = 1540;
export const KITESURF_PKG_HOURS        = 12;
export const KITESURF_PKG_NIGHTS       = 7;

// 1 Week of Half Day SLS Rental
export const SLS_RENTAL_PKG_ID         = 'fb1b0860-0a58-4757-82f4-91946a38ff7c';
export const SLS_RENTAL_PKG_NAME       = '1 Week of Half Day SLS Rental';
export const SLS_RENTAL_PKG_PRICE      = 500;
export const SLS_RENTAL_PKG_DAYS       = 7;

// 6Hours- Starter Package (6 h private lessons)
export const STARTER_PKG_ID            = '63caae97-520a-4a19-b8d5-db8bf3cab5c5';
export const STARTER_PKG_NAME          = '6Hours- Starter Package';
export const STARTER_PKG_PRICE         = 470;
export const STARTER_PKG_HOURS         = 6;

// All Inclusive Beginner Package (12 h lessons + 7 rental days + 8 accommodation nights)
export const ALL_INCLUSIVE_PKG_ID           = '32ab3bf7-93db-422f-8113-b1150bf5ed64';
export const ALL_INCLUSIVE_PKG_NAME         = 'All Inclusive Beginner Package';
export const ALL_INCLUSIVE_PKG_PRICE        = 1930;
export const ALL_INCLUSIVE_PKG_HOURS        = 12;
export const ALL_INCLUSIVE_PKG_SESSIONS     = 6;
export const ALL_INCLUSIVE_PKG_RENTAL_DAYS  = 7;
export const ALL_INCLUSIVE_PKG_NIGHTS       = 8;
export const ALL_INCLUSIVE_PKG_HOURLY_RATE  = 65;
export const ALL_INCLUSIVE_PKG_DAILY_RATE   = 55;
export const ALL_INCLUSIVE_PKG_NIGHTLY_RATE = 120;
export const ALL_INCLUSIVE_LESSON_SERVICE_ID = 'fa23aa65-8e33-425a-89d0-66436881ec03';
export const ALL_INCLUSIVE_RENTAL_SERVICE_ID = '80cd62e7-f712-4110-807a-c9e459000094';
export const ALL_INCLUSIVE_SESSIONS         = [2, 2, 2, 2, 2, 2]; // 12 h total (6 sessions)

// Seasonal Daily Pass (member offering)
export const SEASONAL_PASS_OFFERING_ID = 7;
export const SEASONAL_PASS_PRICE       = 300;

// Semi-Private Beginner Pack (10 h semi-private lessons, 5 sessions × 2h)
export const SEMI_PRIVATE_PKG_ID           = '7c28e424-b463-43d2-b239-470c2741b8c9';
export const SEMI_PRIVATE_PKG_NAME         = 'Semi-Private Beginner Pack';
export const SEMI_PRIVATE_PKG_PRICE        = 550;
export const SEMI_PRIVATE_PKG_HOURS        = 10;
export const SEMI_PRIVATE_PKG_SESSIONS     = 5;
export const SEMI_PRIVATE_PKG_HOURLY_RATE  = 55;
export const SEMI_PRIVATE_LESSON_SERVICE_ID = 'ff10e649-1911-42d3-81b5-80f86127645a';
export const SEMI_PRIVATE_LESSON_PRICE     = 60; // standard €60/h per participant
export const SEMI_PRIVATE_SESSIONS         = [2, 2, 2, 2, 2]; // 10 h total (5 × 2h)

// Accommodation unit (Burlahan Hotel Standard Room)
export const ACCOMMODATION_UNIT_ID     = 'feedcf2f-45f2-4b11-9a51-5ff5becfa116';

// SLS equipment rental service ID (4H half-day)
export const SLS_EQUIPMENT_SERVICE_ID  = '93dba16f-bed5-4e08-826e-1e114c0faad0';

// Session schedules
export const PKG_SESSIONS         = [1, 1, 1, 1.5, 1.5, 2, 2]; // 10 h total
export const NON_PKG_SESSIONS     = [1, 2];                      //  3 h total
export const KITESURF_SESSIONS    = [2, 2, 2, 2, 2, 2];          // 12 h total (6 × 2 h)

// ── Helpers ────────────────────────────────────────────────────────
export const log   = (...a) => console.log(...a);
export const ok    = (msg)  => log(`  ✅ ${msg}`);
export const fail  = (msg)  => log(`  ❌ ${msg}`);
export const title = (msg)  => log(`\n${'═'.repeat(60)}\n  ${msg}\n${'═'.repeat(60)}`);

export async function api(method, path, body, token) {
  const url = `${API}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

export async function apiOk(method, path, body, token) {
  const r = await api(method, path, body, token);
  if (!r.ok) {
    const msg = typeof r.data === 'object'
      ? (r.data.message || r.data.error || JSON.stringify(r.data))
      : String(r.data).slice(0, 200);
    throw new Error(`${method} ${path} → ${r.status}: ${msg}`);
  }
  return r.data;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Admin login — returns JWT token.
 */
export async function adminLogin() {
  const { token } = await apiOk('POST', '/auth/login', {
    email: ADMIN_EMAIL,
    password: PASSWORD,
  });
  return token;
}
