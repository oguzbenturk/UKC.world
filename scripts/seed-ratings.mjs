/**
 * Seed Script: Student Ratings for Instructors
 *
 * Usage:  node scripts/seed-ratings.mjs
 *
 * What it does:
 *  1. Logs in as admin, fetches all completed bookings with instructors
 *  2. Fetches student details for those bookings
 *  3. Logs in as each student and submits ratings via POST /ratings
 *  4. Produces varied, realistic ratings (weighted toward 4-5 stars)
 *  5. ~30% of ratings are submitted anonymously
 *  6. Writes a manifest for rollback
 *
 * Outputs:  scripts/seed-ratings-manifest.json
 */

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(__dirname, 'seed-ratings-manifest.json');
const API = process.env.API_URL || 'http://localhost:4000/api';
const PASSWORD = 'asdasd35';

const manifest = {
  createdAt: new Date().toISOString(),
  ratingIds: [],
  ratedBookingIds: [],
  studentEmails: [],
};

function saveManifest() {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

// ─── Rating data pools ─────────────────────────────────────────────
const FEEDBACK_POSITIVE = [
  'Amazing instructor! Really patient and explained everything clearly.',
  'Best kitesurfing lesson I have ever had. Highly recommend!',
  'Very professional and made me feel safe throughout the lesson.',
  'Great session! I learned so much in just one hour.',
  'Excellent teaching style, very encouraging and supportive.',
  'Fantastic experience! The instructor was very knowledgeable.',
  'Really enjoyed the lesson. Will definitely book again!',
  'Perfect instructor for beginners. Very calm and helpful.',
  'Outstanding instruction. I was riding upwind by the end!',
  'Super fun lesson with great tips for improving technique.',
  'The instructor adapted perfectly to my skill level.',
  'Wonderful experience from start to finish!',
  'Very well organized lesson with clear progression.',
  'I felt confident and safe the entire time. Great job!',
  'Incredible patience with a nervous beginner like me!',
];

const FEEDBACK_NEUTRAL = [
  'Good lesson overall, but felt a bit rushed at the end.',
  'Decent instruction, could have spent more time on fundamentals.',
  'The lesson was okay. Equipment was good but communication could improve.',
  'Solid lesson, though I expected more hands-on practice time.',
  'Nice instructor but the session felt shorter than expected.',
  'Satisfactory experience. Would try a different instructor next time.',
  'The basics were covered well, but advanced techniques were skipped.',
  'Good enough for the price. Nothing extraordinary.',
];

const FEEDBACK_NEGATIVE = [
  'The instructor seemed distracted and not fully engaged.',
  'Expected better safety briefing before getting in the water.',
  'Communication was difficult and instructions were unclear.',
  'Not great. The lesson lacked structure and I felt lost.',
  'Disappointing experience. Very little actual instruction time.',
];

// Weighted distribution: mostly 4-5 stars (realistic)
// ~40% → 5 stars, ~30% → 4 stars, ~15% → 3 stars, ~10% → 2 stars, ~5% → 1 star
const RATING_WEIGHTS = [
  { rating: 5, weight: 40 },
  { rating: 4, weight: 30 },
  { rating: 3, weight: 15 },
  { rating: 2, weight: 10 },
  { rating: 1, weight: 5 },
];

// ─── Helpers ────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pickWeightedRating() {
  const total = RATING_WEIGHTS.reduce((sum, w) => sum + w.weight, 0);
  let rand = Math.random() * total;
  for (const { rating, weight } of RATING_WEIGHTS) {
    rand -= weight;
    if (rand <= 0) return rating;
  }
  return 5;
}

function pickFeedback(rating) {
  if (rating >= 4) return FEEDBACK_POSITIVE[Math.floor(Math.random() * FEEDBACK_POSITIVE.length)];
  if (rating === 3) return FEEDBACK_NEUTRAL[Math.floor(Math.random() * FEEDBACK_NEUTRAL.length)];
  return FEEDBACK_NEGATIVE[Math.floor(Math.random() * FEEDBACK_NEGATIVE.length)];
}

function deriveServiceType(booking) {
  const cat = (booking.service_category || '').toLowerCase();
  const stype = (booking.service_type || '').toLowerCase();
  const name = (booking.serviceName || booking.service_name || '').toLowerCase();

  if (cat.includes('rental') || stype.includes('rental') || name.includes('rental') || name.includes('equipment')) {
    return 'rental';
  }
  if (cat.includes('accommodation') || stype.includes('accommodation') || name.includes('accommodation')) {
    return 'accommodation';
  }
  return 'lesson';
}

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
  console.log('⭐ Seed: Student ratings for instructors\n');

  // Check for existing manifest
  if (existsSync(MANIFEST_PATH)) {
    const existing = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    if (existing.ratingIds?.length > 0) {
      console.log(`⚠️  Existing manifest found with ${existing.ratingIds.length} ratings.`);
      console.log('   Run seed-ratings-rollback.mjs first, or delete the manifest.\n');
      process.exit(1);
    }
  }

  // ── Step 1: Admin login ──
  console.log('1️⃣  Logging in as admin...');
  const loginRes = await api('POST', '/auth/login', {
    email: 'admin@plannivo.com',
    password: PASSWORD,
  });
  const adminToken = loginRes.token;
  console.log(`   ✅ Logged in as ${loginRes.user?.name || loginRes.user?.email}\n`);

  // ── Step 2: Fetch completed bookings with instructors ──
  console.log('2️⃣  Fetching completed bookings...');
  const completedBookings = [];

  for (const status of ['completed', 'checked_out', 'done']) {
    try {
      const bookings = await api('GET', `/bookings?status=${status}&limit=500`, null, adminToken);
      const withInstructors = (Array.isArray(bookings) ? bookings : [])
        .filter(b => b.instructor_user_id && (b.student_user_id || b.customer_user_id));
      completedBookings.push(...withInstructors);
      console.log(`   ${status}: ${withInstructors.length} bookings with instructors`);
    } catch (e) {
      console.log(`   ⚠️  Could not fetch ${status} bookings: ${e.message}`);
    }
  }

  if (completedBookings.length === 0) {
    console.log('\n❌ No completed bookings with instructors found. Nothing to rate.');
    process.exit(1);
  }

  // Deduplicate by booking ID (status aliases might overlap)
  const uniqueBookings = [];
  const seenIds = new Set();
  for (const b of completedBookings) {
    if (!seenIds.has(b.id)) {
      seenIds.add(b.id);
      uniqueBookings.push(b);
    }
  }
  console.log(`   Total unique: ${uniqueBookings.length} bookings\n`);

  // ── Step 3: Group bookings by student and get student details ──
  console.log('3️⃣  Grouping bookings by student...');
  const studentBookingsMap = new Map(); // studentId -> { email, bookings[] }

  for (const b of uniqueBookings) {
    const studentId = b.student_user_id || b.customer_user_id;
    if (!studentBookingsMap.has(studentId)) {
      studentBookingsMap.set(studentId, { id: studentId, email: null, bookings: [] });
    }
    studentBookingsMap.get(studentId).bookings.push(b);
  }

  // Fetch user details to get emails for login
  console.log('   Fetching student emails...');
  for (const [studentId, studentData] of studentBookingsMap) {
    try {
      const user = await api('GET', `/users/${studentId}`, null, adminToken);
      studentData.email = user.email;
      studentData.name = user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim();
    } catch (e) {
      console.log(`   ⚠️  Could not fetch user ${studentId}: ${e.message}`);
      studentBookingsMap.delete(studentId);
    }
    await sleep(30);
  }

  const students = [...studentBookingsMap.values()].filter(s => s.email);
  const totalBookingsToRate = students.reduce((sum, s) => sum + s.bookings.length, 0);
  console.log(`   ${students.length} students with ${totalBookingsToRate} bookings to rate\n`);

  if (students.length === 0) {
    console.log('❌ No students found with valid emails. Nothing to rate.');
    process.exit(1);
  }

  // ── Step 4: Log in as each student and submit ratings ──
  console.log('4️⃣  Submitting ratings...\n');

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const student of students) {
    // Try to log in as this student
    let studentToken;
    try {
      const loginResult = await api('POST', '/auth/login', {
        email: student.email,
        password: PASSWORD,
      });
      studentToken = loginResult.token;
    } catch (e) {
      console.log(`   ⚠️  Cannot login as ${student.email}: ${e.message}`);
      skipCount += student.bookings.length;
      continue;
    }

    console.log(`   📝 ${student.name || student.email} (${student.bookings.length} bookings):`);
    manifest.studentEmails.push(student.email);

    for (const booking of student.bookings) {
      const rating = pickWeightedRating();
      const isAnonymous = Math.random() < 0.3;
      const feedbackText = pickFeedback(rating);
      const serviceType = deriveServiceType(booking);

      try {
        const result = await api('POST', '/ratings', {
          bookingId: booking.id,
          rating,
          feedbackText,
          isAnonymous,
          serviceType,
        }, studentToken);

        manifest.ratingIds.push(result.id);
        manifest.ratedBookingIds.push(booking.id);
        successCount++;

        const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
        const anonLabel = isAnonymous ? ' (anon)' : '';
        console.log(`      ${stars} → ${booking.instructor_name || 'Instructor'}${anonLabel} [${serviceType}]`);
      } catch (e) {
        if (e.message.includes('already rated') || e.message.includes('409')) {
          console.log(`      ⏭️  Already rated (booking ${booking.id.slice(0, 8)}...)`);
          skipCount++;
        } else {
          console.log(`      ❌ Failed: ${e.message}`);
          failCount++;
        }
      }

      await sleep(50);
    }

    saveManifest();
    console.log('');
  }

  // ── Summary ──
  saveManifest();
  console.log('═══════════════════════════════════════════════');
  console.log(`✅ SEED COMPLETE`);
  console.log(`   Ratings created: ${successCount}`);
  console.log(`   Already rated (skipped): ${skipCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log(`   Manifest: ${MANIFEST_PATH}`);
  console.log('═══════════════════════════════════════════════');
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  saveManifest();
  process.exit(1);
});
