// Instructor "My day" dashboard endpoints (GET /api/instructors/me/today, /me/week).
//
// Integration suite: hits the real LOCAL dev DB through server.js with throw-away
// users / bookings (removed in afterAll). The waiver service is mocked so we can
// assert exactly whose waiver status the endpoint asked for (own students only).
import { jest, describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

let app;
let pool;
let waiverMock;
let todayService;

const RUN = crypto.randomBytes(4).toString('hex');
const ids = {};
const signedWaivers = new Set();

// A Wednesday far in the future so nothing else in the dev DB lands on it.
const DAY = '2031-03-12';
const NEXT_DAY = '2031-03-13';
const WEEK_START = '2031-03-10'; // Monday

const token = (id, role) =>
  jwt.sign({ id, email: `${role}-${RUN}@today.test`, role }, process.env.JWT_SECRET || 'plannivo-jwt-secret-key', { expiresIn: '1h' });

async function createUser(roleName, first, extra = {}) {
  const { rows: [role] } = await pool.query('SELECT id FROM roles WHERE name = $1', [roleName]);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (name, first_name, last_name, email, password_hash, role_id, level)
     VALUES ($1, $2, 'Today', $3, 'x', $4, $5) RETURNING id`,
    [`${first} Today`, first, `${first.toLowerCase()}-${RUN}@today.test`, role.id, extra.level || null],
  );
  return user.id;
}

async function addLesson(instructorId, studentId, { date, startHour, duration = 2, status = 'confirmed', paymentStatus = 'paid' }) {
  const { rows: [row] } = await pool.query(
    `INSERT INTO bookings (date, start_hour, duration, status, payment_status, amount, final_amount, currency,
                           instructor_user_id, student_user_id, customer_user_id)
     VALUES ($1, $2, $3, $4, $5, 100, 100, 'EUR', $6, $7, $7) RETURNING id`,
    [date, startHour, duration, status, paymentStatus, instructorId, studentId],
  );
  return row.id;
}

beforeAll(async () => {
  await jest.unstable_mockModule('../../../../backend/services/waiverService.js', () => ({
    needsToSignWaiver: jest.fn(async (id) => !signedWaivers.has(id)),
    checkWaiverStatus: jest.fn(async () => ({ hasSigned: false, needsToSign: true })),
    submitWaiver: jest.fn(),
    getWaiverHistory: jest.fn(async () => []),
    getWaiverVersion: jest.fn(),
    getLatestActiveVersion: jest.fn(),
    createWaiverVersion: jest.fn(),
    deleteWaiverById: jest.fn(),
    deleteWaiversForFamilyMember: jest.fn(),
    deleteWaiversForUser: jest.fn(),
    getSignerDetails: jest.fn(),
    generateSignaturePublicUrl: jest.fn(),
  }));

  ({ default: app } = await import('../../../../backend/server.js'));
  ({ pool } = await import('../../../../backend/db.js'));
  waiverMock = await import('../../../../backend/services/waiverService.js');
  todayService = await import('../../../../backend/services/instructorTodayService.js');

  ids.a = await createUser('instructor', 'Alice');
  ids.b = await createUser('instructor', 'Bob');
  ids.s1 = await createUser('student', 'Hazal', { level: 'Intermediate' });
  ids.s2 = await createUser('student', 'Nina');
  ids.s3 = await createUser('student', 'Other');
  signedWaivers.add(ids.s1);

  // Alice on DAY: 09:00 (Hazal, paid) and 13:00 (Nina, unpaid — must NOT surface); a cancelled one that must not show.
  ids.l1 = await addLesson(ids.a, ids.s1, { date: DAY, startHour: 9 });
  ids.l2 = await addLesson(ids.a, ids.s2, { date: DAY, startHour: 13, paymentStatus: 'unpaid' });
  ids.lCancelled = await addLesson(ids.a, ids.s1, { date: DAY, startHour: 16, status: 'cancelled' });
  // Alice on NEXT_DAY at 10:00 (used for the 02:30-local bucketing check).
  ids.l3 = await addLesson(ids.a, ids.s1, { date: NEXT_DAY, startHour: 10, duration: 1.5 });
  // Bob on DAY with his own student — must never leak into Alice's day.
  ids.lb = await addLesson(ids.b, ids.s3, { date: DAY, startHour: 9 });

  // Alice: approved day off on Friday, pending request on Thursday (ignored),
  // and Sundays marked non-working in her weekly hours.
  await pool.query(
    `INSERT INTO instructor_availability (instructor_id, start_date, end_date, type, status)
     VALUES ($1, '2031-03-14', '2031-03-14', 'off_day', 'approved'),
            ($1, '2031-03-13', '2031-03-13', 'off_day', 'pending')`,
    [ids.a],
  );
  await pool.query(
    `INSERT INTO instructor_working_hours (instructor_id, day_of_week, is_working) VALUES ($1, 0, false)`,
    [ids.a],
  );

  ids.tokens = {
    a: token(ids.a, 'instructor'),
    b: token(ids.b, 'instructor'),
    s1: token(ids.s1, 'student'),
  };
});

afterAll(async () => {
  const users = [ids.a, ids.b, ids.s1, ids.s2, ids.s3].filter(Boolean);
  if (!pool || !users.length) return;
  const cleanup = [
    'DELETE FROM instructor_student_notes WHERE instructor_id = ANY($1::uuid[])',
    'DELETE FROM instructor_availability WHERE instructor_id = ANY($1::uuid[])',
    'DELETE FROM instructor_working_hours WHERE instructor_id = ANY($1::uuid[])',
    'DELETE FROM bookings WHERE instructor_user_id = ANY($1::uuid[])',
    'DELETE FROM users WHERE id = ANY($1::uuid[])',
  ];
  for (const sql of cleanup) {
    try { await pool.query(sql, [users]); } catch { /* best-effort cleanup */ }
  }
}, 30000);

beforeEach(() => {
  waiverMock.needsToSignWaiver.mockClear();
});

const api = (url, who) => {
  const req = request(app).get(url);
  return who ? req.set('Authorization', `Bearer ${ids.tokens[who]}`) : req;
};

describe('GET /api/instructors/me/today', () => {
  test('returns only the caller\'s own, non-cancelled lessons with summary + next lesson', async () => {
    const res = await api(`/api/instructors/me/today?date=${DAY}`, 'a');
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(DAY);
    expect(res.body.lessons.map((l) => l.id)).toEqual([ids.l1, ids.l2]);
    expect(res.body.summary).toEqual({ lessons: 2, hours: 4, firstStart: '09:00' });
    // DAY is in the future relative to the real clock → first open lesson is next.
    expect(res.body.nextLessonId).toBe(ids.l1);

    const [first] = res.body.lessons;
    expect(first).toMatchObject({ startHour: '09:00', durationHours: 2, checkinStatus: 'pending', equipment: [], packageInfo: null });
    expect(first.participants).toEqual([
      expect.objectContaining({ userId: ids.s1, name: 'Hazal Today', initials: 'HT', skillLevel: 'Intermediate', waiverSigned: true }),
    ]);

    const bob = await api(`/api/instructors/me/today?date=${DAY}`, 'b');
    expect(bob.status).toBe(200);
    expect(bob.body.lessons.map((l) => l.id)).toEqual([ids.lb]);
  });

  test('waiver status is computed for the caller\'s own students only', async () => {
    const res = await api(`/api/instructors/me/today?date=${DAY}`, 'a');
    const asked = waiverMock.needsToSignWaiver.mock.calls.map(([id]) => id);
    expect(new Set(asked)).toEqual(new Set([ids.s1, ids.s2]));
    expect(asked).not.toContain(ids.s3);

    const nina = res.body.lessons[1].participants[0];
    expect(nina).toMatchObject({ userId: ids.s2, waiverSigned: false });
  });

  test('attention lists only the missing waiver (no unpaid item); it disappears once signed', async () => {
    // l2 is unpaid in the DB — instructors must not be told about payment state.
    const res = await api(`/api/instructors/me/today?date=${DAY}`, 'a');
    expect(res.body.attention).toEqual([
      expect.objectContaining({ kind: 'waiver_missing', bookingId: ids.l2, userId: ids.s2, name: 'Nina Today', startHour: '13:00' }),
    ]);
    expect(res.body.attention.some((i) => i.kind === 'unpaid_checkin')).toBe(false);

    signedWaivers.add(ids.s2);
    try {
      const after = await api(`/api/instructors/me/today?date=${DAY}`, 'a');
      expect(after.body.attention).toEqual([]);
    } finally {
      signedWaivers.delete(ids.s2);
    }
  });

  test('returns no payment fields anywhere (payment status / amounts are not part of the instructor view)', async () => {
    const res = await api(`/api/instructors/me/today?date=${DAY}`, 'a');
    expect(res.status).toBe(200);
    for (const lesson of res.body.lessons) {
      expect(lesson).not.toHaveProperty('paymentStatus');
      expect(lesson).not.toHaveProperty('payment_status');
    }
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/payment|unpaid|amount|price/i);
  });

  test('includes the latest note the instructor wrote for the student', async () => {
    const created = await request(app)
      .post(`/api/instructors/me/students/${ids.s1}/notes`)
      .set('Authorization', `Bearer ${ids.tokens.a}`)
      .send({ note: 'Riding both directions. Next: upwind.', bookingId: ids.l1, visibility: 'instructor_only' });
    expect(created.status).toBe(201);

    const res = await api(`/api/instructors/me/today?date=${DAY}`, 'a');
    expect(res.body.lessons[0].participants[0].lastNote).toEqual({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      text: 'Riding both directions. Next: upwind.',
    });
  });

  test('buckets by plain business date: at 02:30 local "today" is the new day', async () => {
    // 2031-03-12T23:30Z = 2031-03-13 02:30 in Europe/Istanbul (UTC+3).
    const now = new Date('2031-03-12T23:30:00Z');
    const data = await todayService.getInstructorToday(ids.a, { now });
    expect(data.today).toBe(NEXT_DAY);
    expect(data.date).toBe(NEXT_DAY);
    expect(data.lessons.map((l) => l.id)).toEqual([ids.l3]);
    expect(data.nextLessonId).toBe(ids.l3);
    expect(data.summary).toEqual({ lessons: 1, hours: 1.5, firstStart: '10:00' });

    // Late in DAY (after both lessons ended) there is no next lesson.
    const late = await todayService.getInstructorToday(ids.a, { now: new Date('2031-03-12T18:00:00Z') });
    expect(late.date).toBe(DAY);
    expect(late.nextLessonId).toBeNull();
  });

  test('validates the date and requires an instructor', async () => {
    expect((await api('/api/instructors/me/today?date=2031-02-30', 'a')).status).toBe(400);
    expect((await api('/api/instructors/me/today?date=yesterday', 'a')).status).toBe(400);
    expect((await api('/api/instructors/me/today', 's1')).status).toBe(403);
    expect((await api('/api/instructors/me/today')).status).toBe(401);
  });
});

describe('GET /api/instructors/me/week', () => {
  test('seven days with lessons, hours and off-days from approved time-off + working hours', async () => {
    const res = await api(`/api/instructors/me/week?start=${WEEK_START}`, 'a');
    expect(res.status).toBe(200);
    expect(res.body.start).toBe(WEEK_START);
    expect(res.body.end).toBe('2031-03-16');
    expect(res.body.days).toHaveLength(7);
    const byDate = Object.fromEntries(res.body.days.map((d) => [d.date, d]));
    expect(byDate[DAY]).toEqual({ date: DAY, lessons: 2, hours: 4, off: false });
    expect(byDate[NEXT_DAY]).toEqual({ date: NEXT_DAY, lessons: 1, hours: 1.5, off: false }); // pending request ≠ off
    expect(byDate['2031-03-14'].off).toBe(true); // approved day off
    expect(byDate['2031-03-16'].off).toBe(true); // Sunday, non-working
    expect(byDate[WEEK_START]).toEqual({ date: WEEK_START, lessons: 0, hours: 0, off: false });
    expect(res.body.totals).toEqual({ lessons: 3, hours: 5.5 });
  });

  test('only counts the caller\'s lessons and defaults to the current week', async () => {
    const bob = await api(`/api/instructors/me/week?start=${WEEK_START}`, 'b');
    expect(bob.body.totals).toEqual({ lessons: 1, hours: 2 });
    expect(bob.body.days.every((d) => d.off === false)).toBe(true);

    const current = await api('/api/instructors/me/week', 'a');
    expect(current.status).toBe(200);
    expect(current.body.start).toBe(todayService.startOfWeek(current.body.today));
    expect((await api('/api/instructors/me/week?start=2031-13-01', 'a')).status).toBe(400);
  });
});
