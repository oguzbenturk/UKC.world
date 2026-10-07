// Integration: instructors may only read/modify lessons they teach
// (backend/middlewares/bookingOwnership.js). Runs against the LOCAL dev DB with
// throw-away users/bookings that are removed in afterAll. The unified
// notification dispatcher is mocked so nothing is sent.
import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

let app;
let pool;
let ownership;

const RUN = crypto.randomBytes(4).toString('hex');
const ids = {};
const tok = {};
const DATE = '2031-03-11';
// idx_bookings_no_overlap is unique per instructor/date/start — extra fixtures get their own day
let extraDay = 0;
const nextExtraDate = () => `2031-04-${String(++extraDay).padStart(2, '0')}`;

const token = (id, role) =>
  jwt.sign({ id, email: `${role}-${RUN}@owner.test`, role }, process.env.JWT_SECRET || 'plannivo-jwt-secret-key', { expiresIn: '1h' });

async function createUser(roleName, first) {
  const { rows: [role] } = await pool.query('SELECT id FROM roles WHERE name = $1', [roleName]);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (name, first_name, last_name, email, password_hash, role_id)
     VALUES ($1, $2, 'Owner', $3, 'x', $4) RETURNING id`,
    [`${first} Owner`, first, `${first.toLowerCase()}-${RUN}@owner.test`, role.id],
  );
  return user.id;
}

async function addBooking(instructorId, { startHour = 10, status = 'confirmed', amount = 100, date = DATE } = {}) {
  const { rows: [b] } = await pool.query(
    `INSERT INTO bookings (date, start_hour, duration, status, payment_status, amount, final_amount, currency,
                           instructor_user_id, student_user_id, notes)
     VALUES ($1, $2, 1, $3, 'paid', $4, $4, 'EUR', $5, $6, 'seed') RETURNING id`,
    [date, startHour, status, amount, instructorId, ids.student],
  );
  return b.id;
}

const auth = (t) => ({ Authorization: `Bearer ${t}` });

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
  ownership = await import('../../../../backend/middlewares/bookingOwnership.js');

  ids.admin = await createUser('admin', 'Adm');
  ids.manager = await createUser('manager', 'Man');
  ids.a = await createUser('instructor', 'Ann');
  ids.b = await createUser('instructor', 'Ben');
  ids.student = await createUser('student', 'Stu');

  ids.aBooking = await addBooking(ids.a, { startHour: 9 });
  ids.aBooking2 = await addBooking(ids.a, { startHour: 12 });
  ids.aCompleted = await addBooking(ids.a, { startHour: 15, status: 'completed' });
  ids.bBooking = await addBooking(ids.b, { startHour: 9 });
  ids.bCompleted = await addBooking(ids.b, { startHour: 15, status: 'completed' });

  tok.admin = token(ids.admin, 'admin');
  tok.manager = token(ids.manager, 'manager');
  tok.a = token(ids.a, 'instructor');
  tok.b = token(ids.b, 'instructor');
});

afterAll(async () => {
  const users = [ids.admin, ids.manager, ids.a, ids.b, ids.student].filter(Boolean);
  if (!pool || !users.length) return;
  const cleanup = [
    'DELETE FROM instructor_earnings WHERE booking_id IN (SELECT id FROM bookings WHERE instructor_user_id = ANY($1::uuid[]))',
    'DELETE FROM manager_commissions WHERE booking_id IN (SELECT id FROM bookings WHERE instructor_user_id = ANY($1::uuid[]))',
    'DELETE FROM notifications WHERE user_id = ANY($1::uuid[])',
    'DELETE FROM bookings WHERE instructor_user_id = ANY($1::uuid[]) OR student_user_id = ANY($1::uuid[])',
    'DELETE FROM users WHERE id = ANY($1::uuid[])',
  ];
  for (const sql of cleanup) {
    try { await pool.query(sql, [users]); } catch { /* best-effort cleanup */ }
  }
});

describe('GET /api/bookings/:id', () => {
  test("instructor A cannot read instructor B's booking (403 NOT_YOUR_BOOKING)", async () => {
    const res = await request(app).get(`/api/bookings/${ids.bBooking}`).set(auth(tok.a));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_YOUR_BOOKING');
  });

  test('instructor A can read own booking', async () => {
    const res = await request(app).get(`/api/bookings/${ids.aBooking}`).set(auth(tok.a));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ids.aBooking);
  });

  test("admin and manager can read any instructor's booking", async () => {
    for (const t of [tok.admin, tok.manager]) {
      const res = await request(app).get(`/api/bookings/${ids.bBooking}`).set(auth(t));
      expect(res.status).toBe(200);
    }
  });
});

describe('PUT /api/bookings/:id', () => {
  test("instructor A cannot update instructor B's booking", async () => {
    const res = await request(app).put(`/api/bookings/${ids.bBooking}`).set(auth(tok.a))
      .send({ checkin_status: 'checked-in', notes: 'hijack' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_YOUR_BOOKING');
    const { rows: [row] } = await pool.query('SELECT notes, checkin_status FROM bookings WHERE id = $1', [ids.bBooking]);
    expect(row.notes).toBe('seed');
  });

  test('instructor A can update notes / check-in on own booking', async () => {
    const res = await request(app).put(`/api/bookings/${ids.aBooking}`).set(auth(tok.a))
      .send({ notes: 'own note', checkin_status: 'checked-in' });
    expect(res.status).toBe(200);
    const { rows: [row] } = await pool.query('SELECT notes, checkin_status FROM bookings WHERE id = $1', [ids.aBooking]);
    expect(row.notes).toBe('own note');
    expect(row.checkin_status).toBe('checked-in');
  });

  test.each([
    [{ amount: 999 }, 'amount'],
    [{ final_amount: 1 }, 'final_amount'],
    [{ payment_status: 'unpaid' }, 'payment_status'],
    [{ instructor_commission: 80, instructor_commission_type: 'percentage' }, 'instructor_commission'],
    [{ instructor_user_id: 'B' }, 'instructor_user_id'],
    [{ student_user_id: 'ADMIN' }, 'student_user_id'],
  ])('instructor cannot change money/assignment field on own booking: %j', async (body, field) => {
    const payload = { ...body };
    if (payload.instructor_user_id === 'B') payload.instructor_user_id = ids.b;
    if (payload.student_user_id === 'ADMIN') payload.student_user_id = ids.admin;
    // fresh booking per case: the PUT rate limiter is keyed on ip+url (5 / 5s)
    const bookingId = await addBooking(ids.a, { startHour: 10, date: nextExtraDate() });
    const res = await request(app).put(`/api/bookings/${bookingId}`).set(auth(tok.a)).send(payload);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSTRUCTOR_FIELD_FORBIDDEN');
    expect(res.body.fields).toContain(field);
    const { rows: [row] } = await pool.query(
      'SELECT amount, payment_status, instructor_user_id, student_user_id FROM bookings WHERE id = $1', [bookingId]);
    expect(Number(row.amount)).toBe(100);
    expect(row.payment_status).toBe('paid');
    expect(row.instructor_user_id).toBe(ids.a);
    expect(row.student_user_id).toBe(ids.student);
  });

  test('echoing the current amount / own instructor id is still allowed', async () => {
    const bookingId = await addBooking(ids.a, { startHour: 10, date: nextExtraDate() });
    const res = await request(app).put(`/api/bookings/${bookingId}`).set(auth(tok.a))
      .send({ amount: 100, final_amount: '100.00', instructor_user_id: ids.a, payment_status: 'paid', notes: 'echo' });
    expect(res.status).toBe(200);
  });

  test("admin can still update another instructor's booking", async () => {
    const res = await request(app).put(`/api/bookings/${ids.bBooking}`).set(auth(tok.admin))
      .send({ notes: 'admin note' });
    expect(res.status).toBe(200);
    const { rows: [row] } = await pool.query('SELECT notes FROM bookings WHERE id = $1', [ids.bBooking]);
    expect(row.notes).toBe('admin note');
  });
});

describe('PATCH /api/bookings/:id/status', () => {
  test("instructor A cannot change status of instructor B's booking", async () => {
    const res = await request(app).patch(`/api/bookings/${ids.bCompleted}/status`).set(auth(tok.a))
      .send({ status: 'completed' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_YOUR_BOOKING');
  });

  test('instructor A cannot complete own booking (closing a lesson is staff-only)', async () => {
    const res = await request(app).patch(`/api/bookings/${ids.aCompleted}/status`).set(auth(tok.a))
      .send({ status: 'completed' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSTRUCTOR_CANNOT_COMPLETE');
  });

  test('instructor A can still change a non-closing status of own booking', async () => {
    const res = await request(app).patch(`/api/bookings/${ids.aCompleted}/status`).set(auth(tok.a))
      .send({ status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("manager can change status of any instructor's booking", async () => {
    const res = await request(app).patch(`/api/bookings/${ids.bCompleted}/status`).set(auth(tok.manager))
      .send({ status: 'completed' });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/bookings (list) and /api/bookings/calendar', () => {
  test("instructor A only gets own bookings, even when asking for B's instructor_id", async () => {
    const res = await request(app).get('/api/bookings')
      .query({ instructor_id: ids.b, start_date: DATE, end_date: DATE }).set(auth(tok.a));
    expect(res.status).toBe(200);
    const returned = res.body.map((r) => r.id);
    expect(returned).toEqual(expect.arrayContaining([ids.aBooking, ids.aBooking2]));
    expect(returned).not.toContain(ids.bBooking);
    expect(returned).not.toContain(ids.bCompleted);
    expect(res.body.every((r) => r.instructor_user_id === ids.a)).toBe(true);
  });

  test('calendar endpoint is pinned to the caller too', async () => {
    const res = await request(app).get('/api/bookings/calendar')
      .query({ date: DATE, instructor_id: ids.b }).set(auth(tok.a));
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.id)).not.toContain(ids.bBooking);
    expect(res.body.every((r) => r.instructor_user_id === ids.a)).toBe(true);
  });

  test("admin list still filters by any instructor_id", async () => {
    const res = await request(app).get('/api/bookings')
      .query({ instructor_id: ids.b, start_date: DATE, end_date: DATE }).set(auth(tok.admin));
    expect(res.status).toBe(200);
    const returned = res.body.map((r) => r.id);
    expect(returned).toEqual(expect.arrayContaining([ids.bBooking, ids.bCompleted]));
    expect(returned).not.toContain(ids.aBooking);
  });
});

describe('Swap endpoints', () => {
  test("instructor cannot swap own lesson with a colleague's lesson", async () => {
    const res = await request(app).post('/api/bookings/swap').set(auth(tok.a)).send({
      a_id: ids.aBooking, b_id: ids.bBooking,
      a: { instructor_user_id: ids.b, start_hour: 9 },
      b: { instructor_user_id: ids.a, start_hour: 9 },
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_YOUR_BOOKING');
  });

  test('instructor cannot hand own lessons to another instructor via swap', async () => {
    const res = await request(app).post('/api/bookings/swap-auto').set(auth(tok.a)).send({
      a_id: ids.aBooking, b_id: ids.aBooking2,
      a: { instructor_user_id: ids.b, start_hour: 12 },
      b: { instructor_user_id: ids.a, start_hour: 9 },
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSTRUCTOR_REASSIGNMENT_FORBIDDEN');
  });

  test('instructor can swap two of their own lessons', async () => {
    const res = await request(app).post('/api/bookings/swap-auto').set(auth(tok.a)).send({
      a_id: ids.aBooking, b_id: ids.aBooking2,
      a: { instructor_user_id: ids.a, start_hour: 12 },
      b: { instructor_user_id: ids.a, start_hour: 9 },
    });
    expect(res.status).toBe(200);
    const { rows } = await pool.query('SELECT id, start_hour FROM bookings WHERE id = ANY($1::uuid[])', [[ids.aBooking, ids.aBooking2]]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, Number(r.start_hour)]));
    expect(byId[ids.aBooking]).toBe(12);
    expect(byId[ids.aBooking2]).toBe(9);
  });
});

describe('Staff-only booking actions reached via the bookings:write JSONB fallback', () => {
  test('instructor cannot switch funding (money) even on own booking', async () => {
    const res = await request(app).post(`/api/bookings/${ids.aBooking}/switch-funding`).set(auth(tok.a))
      .send({ mode: 'package' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSTRUCTOR_MONEY_FIELD_FORBIDDEN');
  });

  test.each([
    ['post', () => `/api/bookings/${ids.bBooking}/cancel`, {}],
    ['post', () => '/api/bookings/bulk-delete', { ids: [] }],
    ['get', () => '/api/bookings/deleted/list', null],
    ['get', () => '/api/bookings/pending-transfers', null],
  ])('instructor gets 403 STAFF_ONLY on %s %s', async (method, path, body) => {
    let r = request(app)[method](path()).set(auth(tok.a));
    if (body) r = r.send(body);
    const res = await r;
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('STAFF_ONLY');
    const { rows: [row] } = await pool.query('SELECT status, deleted_at FROM bookings WHERE id = $1', [ids.bBooking]);
    expect(row.status).toBe('confirmed');
    expect(row.deleted_at).toBeNull();
  });
});

describe('findBlockedInstructorFieldChanges (unit)', () => {
  const current = { amount: '100.00', final_amount: '100.00', payment_status: 'paid', instructor_user_id: 'i1', student_user_id: 's1', service_id: 'svc1' };

  test('no-op for staff roles', () => {
    for (const role of ['admin', 'manager', 'owner', 'super_admin', 'receptionist', 'front_desk']) {
      const req = { user: { id: 'x', role }, body: { amount: 1, instructor_user_id: 'other' } };
      expect(ownership.findBlockedInstructorFieldChanges(req, current)).toEqual([]);
    }
  });

  test('freelancer is instructor-scoped too', () => {
    const req = { user: { id: 'i1', role: 'freelancer' }, body: { service_id: 'svc2', duration: 2 } };
    expect(ownership.findBlockedInstructorFieldChanges(req, current)).toEqual(['service_id']);
  });

  // Closing fields (status completed, checkout_*) are rejected separately by
  // findInstructorLessonClosingChanges — see instructor-lesson-closing.test.js.
  test('schedule / check-in / checkout fields are not money fields', () => {
    const req = { user: { id: 'i1', role: 'instructor' }, body: {
      date: '2031-01-01', start_hour: 11, duration: 1.5, status: 'completed', notes: 'n',
      checkout_status: 'checked-out', checkin_status: 'checked-in', instructor_user_id: 'i1',
    } };
    expect(ownership.findBlockedInstructorFieldChanges(req, current)).toEqual([]);
  });
});
