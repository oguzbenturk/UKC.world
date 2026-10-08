// Owner decisions 2026-10-08 (backend/middlewares/bookingOwnership.js):
//  1. Instructors may NOT close a lesson — complete / check out / no-show is
//     staff-only (403 INSTRUCTOR_CANNOT_COMPLETE). Check-in stays allowed.
//  2. Instructors create bookings only for themselves (403
//     INSTRUCTOR_OWN_BOOKINGS_ONLY) and only with existing active students
//     (403 INSTRUCTOR_EXISTING_STUDENTS_ONLY).
// Integration suite against the LOCAL dev DB with throw-away users / service /
// bookings removed in afterAll. The notification dispatcher is mocked.
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
const NEW_CUSTOMER_EMAIL = `walkin-${RUN}@closing.test`;
// idx_bookings_no_overlap is unique per instructor/date/start — one day per fixture
let day = 0;
const nextDate = () => {
  const d = new Date(Date.UTC(2031, 4, 1 + day++));
  return d.toISOString().slice(0, 10);
};

const token = (id, role) =>
  jwt.sign({ id, email: `${role}-${RUN}@closing.test`, role }, process.env.JWT_SECRET || 'plannivo-jwt-secret-key', { expiresIn: '1h' });

async function createUser(roleName, first) {
  const { rows: [role] } = await pool.query('SELECT id FROM roles WHERE name = $1', [roleName]);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (name, first_name, last_name, email, password_hash, role_id)
     VALUES ($1, $2, 'Closing', $3, 'x', $4) RETURNING id`,
    [`${first} Closing`, first, `${first.toLowerCase()}-${RUN}@closing.test`, role.id],
  );
  return user.id;
}

async function addBooking(instructorId, { status = 'confirmed', checkin = 'pending' } = {}) {
  const { rows: [b] } = await pool.query(
    `INSERT INTO bookings (date, start_hour, duration, status, payment_status, amount, final_amount, currency,
                           instructor_user_id, student_user_id, checkin_status, checkout_status, notes)
     VALUES ($1, 10, 1, $2, 'paid', 100, 100, 'EUR', $3, $4, $5, 'pending', 'seed') RETURNING id`,
    [nextDate(), status, instructorId, ids.student, checkin],
  );
  return b.id;
}

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const row = async (id) => (await pool.query(
  'SELECT status, checkin_status, checkout_status, checkout_notes, checkout_time FROM bookings WHERE id = $1', [id],
)).rows[0];

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

  ids.manager = await createUser('manager', 'Mgr');
  ids.a = await createUser('instructor', 'Ada');
  ids.b = await createUser('instructor', 'Bo');
  ids.student = await createUser('student', 'Stella');
  ids.student2 = await createUser('student', 'Sam');
  ids.deletedStudent = await createUser('student', 'Gone');
  await pool.query(`UPDATE users SET deleted_at = NOW(), account_status = 'deleted' WHERE id = $1`, [ids.deletedStudent]);

  const { rows: [svc] } = await pool.query(
    `INSERT INTO services (name, category, service_type, duration, price, currency)
     VALUES ($1, 'lesson', 'private', 1, 50, 'EUR') RETURNING id`,
    [`Closing test lesson ${RUN}`],
  );
  ids.service = svc.id;

  tok.manager = token(ids.manager, 'manager');
  tok.a = token(ids.a, 'instructor');
  tok.freelancer = token(ids.a, 'freelancer');
});

afterAll(async () => {
  const users = [ids.manager, ids.a, ids.b, ids.student, ids.student2, ids.deletedStudent].filter(Boolean);
  if (!pool || !users.length) return;
  const bookingIds = 'SELECT id FROM bookings WHERE instructor_user_id = ANY($1::uuid[]) OR student_user_id = ANY($1::uuid[])';
  const cleanup = [
    `DELETE FROM instructor_earnings WHERE booking_id IN (${bookingIds})`,
    `DELETE FROM manager_commissions WHERE source_type = 'booking' AND source_id IN (SELECT id::text FROM (${bookingIds}) b)`,
    `DELETE FROM booking_participants WHERE booking_id IN (${bookingIds})`,
    `DELETE FROM wallet_transactions WHERE user_id = ANY($1::uuid[]) OR booking_id IN (${bookingIds})`,
    'DELETE FROM wallet_balances WHERE user_id = ANY($1::uuid[])',
    'DELETE FROM notifications WHERE user_id = ANY($1::uuid[])',
    'DELETE FROM audit_logs WHERE actor_user_id = ANY($1::uuid[])',
    'DELETE FROM bookings WHERE instructor_user_id = ANY($1::uuid[]) OR student_user_id = ANY($1::uuid[])',
    'DELETE FROM users WHERE id = ANY($1::uuid[])',
  ];
  for (const sql of cleanup) {
    try { await pool.query(sql, [users]); } catch { /* best-effort cleanup */ }
  }
  try { await pool.query('DELETE FROM services WHERE id = $1', [ids.service]); } catch { /* best-effort */ }
  try { await pool.query('DELETE FROM users WHERE LOWER(email) = LOWER($1)', [NEW_CUSTOMER_EMAIL]); } catch { /* best-effort */ }
}, 30000);

describe('PATCH /api/bookings/:id/status — closing a lesson is staff-only', () => {
  test.each(['completed', 'no_show', 'checked_out', 'checked-out', 'done', 'no-show', 'cancelled', 'canceled'])(
    'instructor cannot set "%s" on own booking (403 INSTRUCTOR_CANNOT_COMPLETE)',
    async (status) => {
      const id = await addBooking(ids.a);
      const res = await request(app).patch(`/api/bookings/${id}/status`).set(auth(tok.a)).send({ status });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INSTRUCTOR_CANNOT_COMPLETE');
      expect((await row(id)).status).toBe('confirmed');
    },
  );

  test('freelancer (instructor-scoped) cannot complete either', async () => {
    // Blocked by the route's role gate already (freelancer has no bookings:write);
    // the closing rule is the second line of defence if that ever changes.
    const id = await addBooking(ids.a);
    const res = await request(app).patch(`/api/bookings/${id}/status`).set(auth(tok.freelancer)).send({ status: 'completed' });
    expect(res.status).toBe(403);
    expect((await row(id)).status).toBe('confirmed');
  });

  test.each(['confirmed', 'pending', 'checked-in'])(
    'instructor cannot set "%s" either — every status change is staff-only (403 INSTRUCTOR_LESSON_STAFF_ONLY)',
    async (status) => {
      const id = await addBooking(ids.a, { status: 'pending' });
      const res = await request(app).patch(`/api/bookings/${id}/status`).set(auth(tok.a)).send({ status });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INSTRUCTOR_LESSON_STAFF_ONLY');
      expect((await row(id)).status).toBe('pending');
    },
  );

  test('manager can complete any lesson', async () => {
    const id = await addBooking(ids.a);
    const res = await request(app).patch(`/api/bookings/${id}/status`).set(auth(tok.manager)).send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect((await row(id)).status).toBe('completed');
  });
});

describe('PUT /api/bookings/:id — status, check-in and check-out are staff-only', () => {
  test.each([
    [{ status: 'completed' }, 'status'],
    [{ status: 'no_show' }, 'status'],
    [{ status: 'checked-out' }, 'status'],
    [{ checkout_status: 'checked-out' }, 'checkout_status'],
    [{ checkout_time: '2031-05-01T12:00:00.000Z' }, 'checkout_time'],
    [{ checkout_notes: 'went well' }, 'checkout_notes'],
    [{ status: 'completed', checkout_status: 'checked-out', checkout_time: '2031-05-01T12:00:00.000Z', duration: 1 }, 'checkout_status'],
  ])('instructor cannot close own lesson via PUT %j', async (body, field) => {
    // fresh booking per case: the PUT rate limiter is keyed on ip+url (5 / 5s)
    const id = await addBooking(ids.a, { status: 'checked-in', checkin: 'checked-in' });
    const res = await request(app).put(`/api/bookings/${id}`).set(auth(tok.a)).send(body);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSTRUCTOR_CANNOT_COMPLETE');
    expect(res.body.fields).toContain(field);
    const after = await row(id);
    expect(after.status).toBe('checked-in');
    expect(after.checkout_status).toBe('pending');
    expect(after.checkout_time).toBeNull();
  });

  test.each([
    [{ status: 'checked-in', checkin_status: 'checked-in', checkin_time: '2031-05-01T09:00:00.000Z' }, 'status'],
    [{ checkin_status: 'checked-in' }, 'checkin_status'],
    [{ checkin_time: '2031-05-01T09:00:00.000Z' }, 'checkin_time'],
    [{ checkin_notes: 'arrived' }, 'checkin_notes'],
    [{ status: 'confirmed' }, 'status'],
  ])('instructor cannot check in / change the status of own lesson via PUT %j', async (body, field) => {
    const id = await addBooking(ids.a, { status: 'pending' });
    const res = await request(app).put(`/api/bookings/${id}`).set(auth(tok.a)).send(body);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSTRUCTOR_LESSON_STAFF_ONLY');
    expect(res.body.fields).toContain(field);
    const after = await row(id);
    expect(after.status).toBe('pending');
    expect(after.checkin_status).toBe('pending');
  });

  test('manager can check a student in', async () => {
    const id = await addBooking(ids.a);
    const res = await request(app).put(`/api/bookings/${id}`).set(auth(tok.manager)).send({
      status: 'checked-in', checkin_status: 'checked-in', checkin_time: new Date().toISOString(),
    });
    expect(res.status).toBe(200);
    const after = await row(id);
    expect(after.status).toBe('checked-in');
    expect(after.checkin_status).toBe('checked-in');
  });

  test('echoing the current status / check-in / checkout state back (e.g. a notes edit) is allowed', async () => {
    const id = await addBooking(ids.a);
    const res = await request(app).put(`/api/bookings/${id}`).set(auth(tok.a))
      .send({ notes: 'bring wetsuit', checkout_status: 'pending', checkin_status: 'pending', status: 'confirmed' });
    expect(res.status).toBe(200);
  });

  test('manager can check out a lesson', async () => {
    const id = await addBooking(ids.a, { status: 'checked-in', checkin: 'checked-in' });
    const res = await request(app).put(`/api/bookings/${id}`).set(auth(tok.manager)).send({
      status: 'completed', checkout_status: 'checked-out', checkout_time: new Date().toISOString(), checkout_notes: 'ok',
    });
    expect(res.status).toBe(200);
    const after = await row(id);
    expect(after.status).toBe('completed');
    expect(after.checkout_status).toBe('checked-out');
  });
});

describe('Instructor booking creation — own lessons, existing students only', () => {
  const calendarBody = (overrides = {}) => ({
    date: nextDate(), time: '10:00', duration: 1, serviceId: ids.service,
    user: { id: ids.student, name: 'Stella Closing', email: `stella-${RUN}@closing.test` },
    paymentStatus: 'paid', checkinStatus: 'pending', checkoutStatus: 'pending',
    ...overrides,
  });

  test('POST /bookings/calendar for another instructor → 403 INSTRUCTOR_OWN_BOOKINGS_ONLY', async () => {
    const res = await request(app).post('/api/bookings/calendar').set(auth(tok.a))
      .send(calendarBody({ instructorId: ids.b }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSTRUCTOR_OWN_BOOKINGS_ONLY');
  });

  test('POST /bookings/calendar with a NEW customer (no account) → 403, no user is created', async () => {
    const res = await request(app).post('/api/bookings/calendar').set(auth(tok.a))
      .send(calendarBody({ instructorId: ids.a, user: { name: 'Walk In', email: NEW_CUSTOMER_EMAIL, phone: '+900000' } }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSTRUCTOR_EXISTING_STUDENTS_ONLY');
    const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [NEW_CUSTOMER_EMAIL]);
    expect(rows).toHaveLength(0);
  });

  test.each([
    ['a non-existent user id', () => crypto.randomUUID()],
    ['a deleted account', () => ids.deletedStudent],
  ])('POST /bookings/calendar with %s → 403 INSTRUCTOR_EXISTING_STUDENTS_ONLY', async (_label, studentId) => {
    const res = await request(app).post('/api/bookings/calendar').set(auth(tok.a))
      .send(calendarBody({ instructorId: ids.a, user: { id: studentId(), name: 'X', email: 'x@closing.test' } }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSTRUCTOR_EXISTING_STUDENTS_ONLY');
  });

  test('POST /bookings/calendar cannot create an already checked-out lesson', async () => {
    const res = await request(app).post('/api/bookings/calendar').set(auth(tok.a))
      .send(calendarBody({ instructorId: ids.a, checkoutStatus: 'checked-out' }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSTRUCTOR_CANNOT_COMPLETE');
  });

  test('POST /bookings/calendar rejects a staff discount from an instructor', async () => {
    const res = await request(app).post('/api/bookings/calendar').set(auth(tok.a))
      .send(calendarBody({ instructorId: ids.a, discount_percent: 50 }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSTRUCTOR_FIELD_FORBIDDEN');
  });

  test('POST /bookings/calendar for self with an existing student → 201, pending, not checked in', async () => {
    // A check-in sent by the client is dropped: the lesson starts in the pending stage.
    const body = calendarBody({ checkinStatus: 'checked-in' });
    delete body.instructorId; // filled in with the caller's id
    const res = await request(app).post('/api/bookings/calendar').set(auth(tok.a)).send(body);
    expect(res.status).toBe(201);
    const { rows: [created] } = await pool.query(
      'SELECT instructor_user_id, student_user_id, status, checkin_status FROM bookings WHERE id = $1',
      [res.body.id || res.body.bookingId],
    );
    expect(created.instructor_user_id).toBe(ids.a);
    expect(created.student_user_id).toBe(ids.student);
    expect(created.status).toBe('pending');
    expect(created.checkin_status).toBe('pending');
  });

  test('POST /bookings/group for another instructor → 403 INSTRUCTOR_OWN_BOOKINGS_ONLY', async () => {
    const res = await request(app).post('/api/bookings/group').set(auth(tok.a)).send({
      date: nextDate(), start_hour: 10, duration: 1, service_id: ids.service, instructor_user_id: ids.b,
      participants: [{ userId: ids.student, isPrimary: true }, { userId: ids.student2 }],
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSTRUCTOR_OWN_BOOKINGS_ONLY');
  });

  test('POST /bookings/group with a guest participant (no account) → 403 INSTRUCTOR_EXISTING_STUDENTS_ONLY', async () => {
    const res = await request(app).post('/api/bookings/group').set(auth(tok.a)).send({
      date: nextDate(), start_hour: 10, duration: 1, service_id: ids.service, instructor_user_id: ids.a,
      participants: [
        { userId: ids.student, isPrimary: true },
        { userId: null, userName: 'Guest', userEmail: `guest-${RUN}@closing.test` },
      ],
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSTRUCTOR_EXISTING_STUDENTS_ONLY');
  });

  test('POST /bookings (single) for another instructor or an unknown student → 403', async () => {
    const other = await request(app).post('/api/bookings').set(auth(tok.a)).send({
      date: nextDate(), start_hour: 10, duration: 1, instructor_user_id: ids.b, student_user_id: ids.student,
    });
    expect(other.status).toBe(403);
    expect(other.body.code).toBe('INSTRUCTOR_OWN_BOOKINGS_ONLY');

    const unknown = await request(app).post('/api/bookings').set(auth(tok.a)).send({
      date: nextDate(), start_hour: 10, duration: 1, instructor_user_id: ids.a, student_user_id: crypto.randomUUID(),
    });
    expect(unknown.status).toBe(403);
    expect(unknown.body.code).toBe('INSTRUCTOR_EXISTING_STUDENTS_ONLY');

    const noStudent = await request(app).post('/api/bookings').set(auth(tok.a)).send({
      date: nextDate(), start_hour: 10, duration: 1,
    });
    expect(noStudent.status).toBe(403);
    expect(noStudent.body.code).toBe('INSTRUCTOR_EXISTING_STUDENTS_ONLY');

    const completed = await request(app).post('/api/bookings').set(auth(tok.a)).send({
      date: nextDate(), start_hour: 10, duration: 1, student_user_id: ids.student, status: 'completed',
    });
    expect(completed.status).toBe(403);
    expect(completed.body.code).toBe('INSTRUCTOR_CANNOT_COMPLETE');
  });

  test('POST /group-bookings (student-organised flow) is closed to instructors', async () => {
    const res = await request(app).post('/api/group-bookings').set(auth(tok.a)).send({
      serviceId: ids.service, pricePerPerson: 1, scheduledDate: nextDate(), startTime: '10:00',
      participantIds: [ids.student],
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSTRUCTOR_OWN_BOOKINGS_ONLY');
  });
});

describe('findInstructorLessonClosingChanges / isLessonClosingStatus (unit)', () => {
  const current = { status: 'checked-in', checkout_status: 'pending', checkout_time: null, checkout_notes: null };

  test('closing statuses in every spelling; check-in is not closing', () => {
    // 'cancelled' is staff-only too since 2026-10-08 (owner decision).
    for (const s of ['completed', 'COMPLETED', 'done', 'checked_out', 'checked-out', 'no_show', 'no-show', 'cancelled', 'canceled']) {
      expect(ownership.isLessonClosingStatus(s)).toBe(true);
    }
    for (const s of ['checked-in', 'confirmed', 'pending', '', null, undefined]) {
      expect(ownership.isLessonClosingStatus(s)).toBe(false);
    }
  });

  test('no-op for staff roles', () => {
    for (const role of ['admin', 'manager', 'owner', 'super_admin', 'receptionist', 'front_desk']) {
      const req = { user: { id: 'x', role }, body: { status: 'completed', checkout_status: 'checked-out' } };
      expect(ownership.findInstructorLessonClosingChanges(req, current)).toEqual([]);
    }
  });

  test('instructor: closing status + checkout fields blocked, check-in fields allowed', () => {
    const req = { user: { id: 'i1', role: 'instructor' }, body: {
      status: 'completed', checkout_status: 'checked-out', checkout_time: '2031-01-01T10:00:00Z', checkout_notes: 'x',
      checkin_status: 'checked-in', checkin_time: '2031-01-01T09:00:00Z', notes: 'n',
    } };
    expect(ownership.findInstructorLessonClosingChanges(req, current))
      .toEqual(['status', 'checkout_status', 'checkout_time', 'checkout_notes']);
    const checkIn = { user: { id: 'i1', role: 'instructor' }, body: { status: 'checked-in', checkin_status: 'checked-in' } };
    expect(ownership.findInstructorLessonClosingChanges(checkIn, { status: 'confirmed' })).toEqual([]);
  });
});

describe('findInstructorLessonStatusChanges / create coercion (unit)', () => {
  const current = { status: 'pending', checkin_status: 'pending', checkin_time: null, checkin_notes: null };
  const instructor = (body) => ({ user: { id: 'i1', role: 'instructor' }, body });

  test('instructor: any status change and check-in fields are blocked; echoes pass', () => {
    expect(ownership.findInstructorLessonStatusChanges(instructor({
      status: 'confirmed', checkin_status: 'checked-in', checkin_time: '2031-01-01T09:00:00Z', checkin_notes: 'x', notes: 'n',
    }), current)).toEqual(['status', 'checkin_status', 'checkin_time', 'checkin_notes']);
    expect(ownership.findInstructorLessonStatusChanges(instructor({ status: 'pending', checkin_status: 'pending', checkin_notes: '' }), current))
      .toEqual([]);
  });

  test('no-op for staff roles', () => {
    for (const role of ['admin', 'manager', 'owner', 'receptionist', 'front_desk']) {
      const req = { user: { id: 'x', role }, body: { status: 'checked-in', checkin_status: 'checked-in' } };
      expect(ownership.findInstructorLessonStatusChanges(req, current)).toEqual([]);
    }
  });

  test('create: non-pending status becomes pending and check-in state is dropped', async () => {
    const req = instructor({ status: 'confirmed', checkinStatus: 'checked-in', checkin_status: 'checked-in', checkinTime: 'x' });
    let called = false;
    await ownership.enforceInstructorBookingCreate('calendar')(req, {}, () => { called = true; });
    expect(called).toBe(true);
    expect(req.body.status).toBe('pending');
    expect(req.body).not.toHaveProperty('checkinStatus');
    expect(req.body).not.toHaveProperty('checkin_status');
    expect(req.body).not.toHaveProperty('checkinTime');

    const partner = instructor({ status: 'pending_partner' });
    await ownership.enforceInstructorBookingCreate('calendar')(partner, {}, () => {});
    expect(partner.body.status).toBe('pending_partner');
  });
});
