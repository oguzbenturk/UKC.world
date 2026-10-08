// Manager "Today" dashboard — GET /api/manager/today + managerTodayService.
//
// Integration suite against the LOCAL dev DB. Fixtures live on a random day in
// 2033 (so parallel suites and old rows never collide) and are removed in
// afterAll. Assertions only look at this run's own rows: the day may contain
// other instructors from the dev DB.
import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

let app;
let pool;
let svc;
let businessDate;

const RUN = crypto.randomBytes(4).toString('hex');
const ids = {};
const tok = {};
const DAY = (() => {
  const d = new Date(Date.UTC(2033, 0, 1 + crypto.randomInt(0, 330)));
  return d.toISOString().slice(0, 10);
})();
let NOW; // an instant that is 11:20 on DAY in the business timezone

const token = (id, role) =>
  jwt.sign({ id, email: `${role}-${RUN}@today.test`, role }, process.env.JWT_SECRET || 'plannivo-jwt-secret-key', { expiresIn: '1h' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function createUser(roleName, first) {
  const { rows: [role] } = await pool.query('SELECT id FROM roles WHERE name = $1', [roleName]);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (name, first_name, last_name, email, password_hash, role_id)
     VALUES ($1, $2, 'Today', $3, 'x', $4) RETURNING id`,
    [`${first} Today`, first, `${first.toLowerCase()}-${RUN}@today.test`, role.id],
  );
  return user.id;
}

async function addBooking({ start, duration = 1, status = 'confirmed', instructor = null, checkin = 'pending', createdBy = null }) {
  const { rows: [b] } = await pool.query(
    `INSERT INTO bookings (date, start_hour, duration, status, payment_status, amount, final_amount, currency,
                           instructor_user_id, student_user_id, checkin_status, checkout_status, created_by, notes)
     VALUES ($1, $2, $3, $4, 'unpaid', 140, 140, 'EUR', $5, $6, $7, 'pending', $8, 'today-seed') RETURNING id`,
    [DAY, start, duration, status, instructor, ids.student, checkin, createdBy],
  );
  return b.id;
}

/** 11:20 on DAY in the business timezone, whatever offset that zone has. */
function elevenTwenty() {
  for (let utcHour = 0; utcHour < 24; utcHour += 1) {
    const candidate = new Date(`${DAY}T${String(utcHour).padStart(2, '0')}:20:00Z`);
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: process.env.BUSINESS_TIMEZONE || 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23',
    });
    if (fmt.format(candidate) === '11' && businessDate(candidate) === DAY) return candidate;
  }
  throw new Error('could not build 11:20 local');
}

beforeAll(async () => {
  await jest.unstable_mockModule('../../../../backend/services/notificationDispatcherUnified.js', () => ({
    dispatchNotification: jest.fn(async () => ({ sent: true, id: 'mock' })),
    dispatchToStaff: jest.fn(async () => ({ notified: 0, skipped: 0 })),
    clearPreferenceCache: jest.fn(),
    NOTIFICATION_TYPES: new Set(),
    PREFERENCE_MAP: {},
    default: {},
  }));
  ({ default: app } = await import('../../../../backend/server.js'));
  ({ pool } = await import('../../../../backend/db.js'));
  svc = await import('../../../../backend/services/managerTodayService.js');
  ({ businessDate } = await import('../../../../backend/services/instructorPayoutService.js'));
  NOW = elevenTwenty();

  ids.manager = await createUser('manager', 'Mona');
  ids.a = await createUser('instructor', 'Ada');
  ids.b = await createUser('instructor', 'Bo');
  ids.student = await createUser('student', 'Stella');

  ids.running = await addBooking({ start: 10, duration: 2, instructor: ids.a, checkin: 'checked-in' }); // 10–12, in lesson
  ids.notClosed = await addBooking({ start: 9, duration: 1, instructor: ids.b }); // 09–10, ended, still confirmed
  ids.pending = await addBooking({ start: 15, duration: 1, status: 'pending', instructor: ids.a, createdBy: ids.a });
  ids.unassigned = await addBooking({ start: 14, duration: 1, createdBy: ids.manager });

  const { rows: [pr] } = await pool.query(
    `INSERT INTO instructor_payout_requests (instructor_id, amount, currency, preferred_method, status)
     VALUES ($1, 123.45, 'EUR', 'bank_transfer', 'pending') RETURNING id`,
    [ids.a],
  );
  ids.payoutRequest = pr.id;

  tok.manager = token(ids.manager, 'manager');
  tok.instructor = token(ids.a, 'instructor');
}, 30000);

afterAll(async () => {
  if (!pool) return;
  const users = [ids.manager, ids.a, ids.b, ids.student].filter(Boolean);
  const cleanup = [
    'DELETE FROM instructor_payout_requests WHERE instructor_id = ANY($1::uuid[])',
    'DELETE FROM instructor_earnings WHERE booking_id IN (SELECT id FROM bookings WHERE student_user_id = ANY($1::uuid[]))',
    "DELETE FROM manager_commissions WHERE source_type = 'booking' AND source_id IN (SELECT id::text FROM bookings WHERE student_user_id = ANY($1::uuid[]))",
    'DELETE FROM booking_participants WHERE booking_id IN (SELECT id FROM bookings WHERE student_user_id = ANY($1::uuid[]))',
    'DELETE FROM notifications WHERE user_id = ANY($1::uuid[])',
    'DELETE FROM bookings WHERE student_user_id = ANY($1::uuid[]) OR instructor_user_id = ANY($1::uuid[])',
    'DELETE FROM users WHERE id = ANY($1::uuid[])',
  ];
  for (const sql of cleanup) {
    try { await pool.query(sql, [users]); } catch { /* best-effort cleanup */ }
  }
}, 30000);

describe('getManagerToday (service)', () => {
  let data;
  beforeAll(async () => {
    data = await svc.getManagerToday({ now: NOW, viewer: { id: ids.manager, role: 'manager' } });
  });

  test('is pinned to the business day and the current time', () => {
    expect(data.date).toBe(DAY);
    expect(data.isToday).toBe(true);
    expect(data.nowTime).toBe('11:20');
  });

  test('right now: the checked-in lesson is running, the idle instructor is free', () => {
    expect(data.now.running.map((r) => r.bookingId)).toContain(ids.running);
    expect(data.now.inLesson).toBeGreaterThanOrEqual(1);
    expect(data.now.freeNow.names).toContain('Bo Today');
    expect(data.now.freeNow.names).not.toContain('Ada Today');
  });

  test('needs action: pending (booked by the instructor), unassigned with a free suggestion, not closed', () => {
    const pending = data.actions.toConfirm.items.find((i) => i.bookingId === ids.pending);
    expect(pending).toBeTruthy();
    expect(pending.bookedBy).toEqual({ name: 'Ada Today', role: 'instructor' });
    expect(pending.startHour).toBe('15:00');
    expect(pending.payment).toEqual({ status: 'unpaid', amount: 140 });

    const unassigned = data.actions.unassigned.items.find((i) => i.bookingId === ids.unassigned);
    expect(unassigned).toBeTruthy();
    expect(unassigned.suggested).toBeTruthy();
    expect(unassigned.suggested.id).not.toBe(ids.a); // Ada teaches until 12 and again at 15 — Bo or another free instructor

    const notClosed = data.actions.notClosed.items.find((i) => i.bookingId === ids.notClosed);
    expect(notClosed).toBeTruthy();
    expect(notClosed.endHour).toBe('10:00');
    expect(data.actions.notClosed.items.map((i) => i.bookingId)).not.toContain(ids.running);
  });

  test('missing waivers and pending payout requests', () => {
    expect(data.actions.waivers.items.some((w) => w.userId === ids.student)).toBe(true);
    const request = data.actions.payoutRequests.items.find((r) => r.id === ids.payoutRequest);
    expect(request).toMatchObject({ amount: 123.45, method: 'bank_transfer', instructor: { id: ids.a, name: 'Ada Today' } });
  });

  test('instructors today: booked hours and lesson states per instructor', () => {
    const ada = data.instructors.find((i) => i.id === ids.a);
    expect(ada.hours).toBe(3); // 2 h running + 1 h pending
    expect(ada.lessons.map((l) => l.state).sort()).toEqual(['now', 'pending']);
    const bo = data.instructors.find((i) => i.id === ids.b);
    expect(bo.lessons).toHaveLength(1);
    expect(data.hourly).toHaveLength(12);
    expect(data.hourly.find((h) => h.hour === 10).busy).toBeGreaterThanOrEqual(1);
  });

  test('money block and the manager commission tile', () => {
    expect(data.money.trend).toHaveLength(8);
    expect(typeof data.money.revenueToday).toBe('number');
    expect(data.money.outstanding).toHaveProperty('customers');
    expect(data.myCommission).toMatchObject({ earned: 0, owed: 0 });
  });

  test('my commission is only filled for managers', async () => {
    const asAdmin = await svc.getManagerToday({ now: NOW, viewer: { id: ids.manager, role: 'admin' } });
    expect(asAdmin.myCommission).toBeNull();
  });
});

describe('GET /api/manager/today', () => {
  test('manager → 200 with the dashboard payload', async () => {
    const res = await request(app).get('/api/manager/today').set(auth(tok.manager));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('actions.toConfirm');
    expect(res.body).toHaveProperty('money.trend');
  });

  test('instructor → 403 (staff-only)', async () => {
    const res = await request(app).get('/api/manager/today').set(auth(tok.instructor));
    expect(res.status).toBe(403);
  });

  test('invalid date → 400', async () => {
    const res = await request(app).get('/api/manager/today?date=2033-02-30').set(auth(tok.manager));
    expect(res.status).toBe(400);
  });

  test('a date shows that day', async () => {
    const res = await request(app).get(`/api/manager/today?date=${DAY}`).set(auth(tok.manager));
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(DAY);
    expect(res.body.instructors.find((i) => i.id === ids.a).hours).toBe(3);
  });
});
