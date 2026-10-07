// Integration: deny-by-default booking visibility (backend/middlewares/bookingOwnership.js).
// Every role that is neither staff nor instructor-scoped — student, outsider,
// trusted_customer, customer, custom roles — may only see bookings it is a party
// to (student / payer / participant / parent of the family member), never the
// staff-only booking endpoints, and gets no staff e-mails or other participants'
// contact details. Booking socket events no longer go to the `general` channel.
// Runs against the LOCAL dev DB with throw-away rows removed in afterAll; the
// unified notification dispatcher is mocked so nothing is sent.
import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

let app;
let pool;
let socketService;
let ownership;

const RUN = crypto.randomBytes(4).toString('hex');
// Random far-future day so the Redis /calendar cache never serves another run.
const DATE = `2033-${String(1 + (parseInt(RUN.slice(0, 2), 16) % 12)).padStart(2, '0')}-${String(1 + (parseInt(RUN.slice(2, 4), 16) % 28)).padStart(2, '0')}`;
const CUSTOM_ROLE = `qa_custom_${RUN}`;
const ids = {};
const tok = {};
let hour = 7;

const token = (id, role) =>
  jwt.sign({ id, email: `${role}-${RUN}@vis.test`, role }, process.env.JWT_SECRET || 'plannivo-jwt-secret-key', { expiresIn: '1h' });

async function createUser(roleName, first) {
  const { rows: [role] } = await pool.query('SELECT id FROM roles WHERE name = $1', [roleName]);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (name, first_name, last_name, email, phone, password_hash, role_id)
     VALUES ($1, $2, 'Vis', $3, $4, 'x', $5) RETURNING id`,
    [`${first} Vis`, first, `${first.toLowerCase()}-${RUN}@vis.test`, `+90555${RUN.slice(0, 4)}${hour}`, role.id],
  );
  return user.id;
}

async function addBooking(studentId, { familyMemberId = null } = {}) {
  hour += 1; // idx_bookings_no_overlap: one instructor, distinct start hours
  const { rows: [b] } = await pool.query(
    `INSERT INTO bookings (date, start_hour, duration, status, payment_status, amount, final_amount, currency,
                           instructor_user_id, student_user_id, family_member_id, created_by, updated_by, notes)
     VALUES ($1, $2, 1, 'confirmed', 'paid', 100, 100, 'EUR', $3, $4, $5, $6, $6, 'seed') RETURNING id`,
    [DATE, hour, ids.instructor, studentId, familyMemberId, ids.admin],
  );
  return b.id;
}

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const CUSTOMER_KEYS = ['student', 'outsider', 'trusted', 'customer', 'custom'];
const listIds = (res) => new Set((Array.isArray(res.body) ? res.body : []).map((b) => b.id));

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
  ({ default: socketService } = await import('../../../../backend/services/socketService.js'));
  ownership = await import('../../../../backend/middlewares/bookingOwnership.js');

  // A UI-created custom role that even has bookings:write — still customer-scoped.
  await pool.query(
    `INSERT INTO roles (name, description, permissions) VALUES ($1, 'qa', '{"bookings:read": true, "bookings:write": true}'::jsonb)`,
    [CUSTOM_ROLE],
  );

  ids.admin = await createUser('admin', 'Adm');
  ids.receptionist = await createUser('receptionist', 'Rec');
  ids.instructor = await createUser('instructor', 'Ins');
  ids.instructor2 = await createUser('instructor', 'Ins2');
  ids.student = await createUser('student', 'Stu');
  ids.outsider = await createUser('outsider', 'Out');
  ids.trusted = await createUser('trusted_customer', 'Tru');
  ids.customer = await createUser('customer', 'Cus');
  ids.custom = await createUser(CUSTOM_ROLE, 'Cst');
  ids.participant = await createUser('student', 'Par');
  ids.parent = await createUser('outsider', 'Pnt');
  ids.other = await createUser('student', 'Oth');

  const { rows: [child] } = await pool.query(
    `INSERT INTO family_members (parent_user_id, full_name, date_of_birth, relationship)
     VALUES ($1, 'Kid Vis', '2018-01-01', 'child') RETURNING id`,
    [ids.parent],
  );
  ids.child = child.id;

  ids.bStudent = await addBooking(ids.student);
  ids.bOutsider = await addBooking(ids.outsider);
  ids.bTrusted = await addBooking(ids.trusted);
  ids.bCustomer = await addBooking(ids.customer);
  ids.bCustom = await addBooking(ids.custom);
  ids.bOther = await addBooking(ids.other);
  // Semi-private: student is primary, participant joins.
  ids.bGroup = await addBooking(ids.student);
  await pool.query(
    `INSERT INTO booking_participants (booking_id, user_id, is_primary, payment_status, payment_amount, notes)
     VALUES ($1, $2, true, 'paid', 50, 'primary note'), ($1, $3, false, 'paid', 50, 'participant note')`,
    [ids.bGroup, ids.student, ids.participant],
  );
  // Booked for the parent's child; the student column is someone else on purpose
  // so only the family_members rule can grant access.
  ids.bFamily = await addBooking(ids.other, { familyMemberId: ids.child });

  tok.admin = token(ids.admin, 'admin');
  tok.receptionist = token(ids.receptionist, 'receptionist');
  tok.instructor = token(ids.instructor, 'instructor');
  tok.student = token(ids.student, 'student');
  tok.outsider = token(ids.outsider, 'outsider');
  tok.trusted = token(ids.trusted, 'trusted_customer');
  tok.customer = token(ids.customer, 'customer');
  tok.custom = token(ids.custom, CUSTOM_ROLE);
  tok.participant = token(ids.participant, 'student');
  tok.parent = token(ids.parent, 'outsider');
});

afterAll(async () => {
  const users = Object.entries(ids)
    .filter(([k]) => !k.startsWith('b') && k !== 'child')
    .map(([, v]) => v)
    .filter(Boolean);
  if (!pool || !users.length) return;
  const cleanup = [
    'DELETE FROM instructor_earnings WHERE booking_id IN (SELECT id FROM bookings WHERE instructor_user_id = ANY($1::uuid[]))',
    'DELETE FROM manager_commissions WHERE booking_id IN (SELECT id FROM bookings WHERE instructor_user_id = ANY($1::uuid[]))',
    'DELETE FROM booking_participants WHERE booking_id IN (SELECT id FROM bookings WHERE instructor_user_id = ANY($1::uuid[]))',
    'DELETE FROM notifications WHERE user_id = ANY($1::uuid[])',
    'DELETE FROM bookings WHERE instructor_user_id = ANY($1::uuid[]) OR student_user_id = ANY($1::uuid[])',
    'DELETE FROM family_members WHERE parent_user_id = ANY($1::uuid[])',
    'DELETE FROM rentals WHERE user_id = ANY($1::uuid[])',
    'DELETE FROM users WHERE id = ANY($1::uuid[])',
  ];
  for (const sql of cleanup) {
    try { await pool.query(sql, [users]); } catch { /* best-effort cleanup */ }
  }
  try { await pool.query('DELETE FROM roles WHERE name = $1', [CUSTOM_ROLE]); } catch { /* ignore */ }
});

const OWN = () => ({
  student: ids.bStudent,
  outsider: ids.bOutsider,
  trusted: ids.bTrusted,
  customer: ids.bCustomer,
  custom: ids.bCustom,
});

describe('role model (unit)', () => {
  test('staff / instructor / customer scopes', () => {
    for (const r of ['admin', 'manager', 'owner', 'super_admin', 'developer', 'receptionist', 'front_desk', 'Front Desk']) {
      expect(ownership.isBookingStaffRole(r)).toBe(true);
      expect(ownership.isCustomerScopedRole(r)).toBe(false);
    }
    for (const r of ['instructor', 'freelancer']) {
      expect(ownership.isInstructorScopedRole(r)).toBe(true);
      expect(ownership.isCustomerScopedRole(r)).toBe(false);
    }
    for (const r of ['student', 'outsider', 'trusted_customer', 'customer', 'some_custom_role', '', undefined]) {
      expect(ownership.isCustomerScopedRole(r)).toBe(true);
    }
  });
});

describe('GET /api/bookings (list)', () => {
  test.each(CUSTOMER_KEYS)('%s only gets own bookings', async (who) => {
    const res = await request(app).get(`/api/bookings?start_date=${DATE}&end_date=${DATE}`).set(auth(tok[who]));
    expect(res.status).toBe(200);
    const got = listIds(res);
    expect(got.has(OWN()[who])).toBe(true);
    for (const [k, id] of Object.entries(OWN())) if (k !== who) expect(got.has(id)).toBe(false);
    expect(got.has(ids.bOther)).toBe(false);
    expect(got.has(ids.bFamily)).toBe(false);
  });

  test('?student_id=<someone else> does not widen a customer scope', async () => {
    const res = await request(app).get(`/api/bookings?student_id=${ids.other}&start_date=${DATE}&end_date=${DATE}`).set(auth(tok.outsider));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('customer rows carry no staff e-mails / commission', async () => {
    const res = await request(app).get(`/api/bookings?start_date=${DATE}&end_date=${DATE}`).set(auth(tok.student));
    const row = res.body.find((b) => b.id === ids.bStudent);
    for (const k of ['created_by_email', 'updated_by_email', 'createdByEmail', 'updatedByEmail', 'instructor_commission', 'commission_type']) {
      expect(row).not.toHaveProperty(k);
    }
  });

  test('participant sees the group booking, without the other participant contact', async () => {
    const res = await request(app).get(`/api/bookings?start_date=${DATE}&end_date=${DATE}`).set(auth(tok.participant));
    expect(res.status).toBe(200);
    const got = listIds(res);
    expect(got.has(ids.bGroup)).toBe(true);
    expect(got.has(ids.bStudent)).toBe(false);
    const row = res.body.find((b) => b.id === ids.bGroup);
    const mine = row.participants.find((p) => p.userId === ids.participant);
    const theirs = row.participants.find((p) => p.userId === ids.student);
    expect(mine.userEmail).toContain('@vis.test');
    expect(theirs).toBeDefined();
    expect(theirs).not.toHaveProperty('userEmail');
    expect(theirs).not.toHaveProperty('userPhone');
    expect(theirs).not.toHaveProperty('notes');
  });

  test("family parent sees the child's booking", async () => {
    const res = await request(app).get(`/api/bookings?start_date=${DATE}&end_date=${DATE}`).set(auth(tok.parent));
    expect(res.status).toBe(200);
    const got = listIds(res);
    expect(got.has(ids.bFamily)).toBe(true);
    expect(got.has(ids.bOther)).toBe(false);
  });

  test('staff (admin, receptionist) still see everything incl. audit e-mails', async () => {
    for (const t of [tok.admin, tok.receptionist]) {
      const res = await request(app).get(`/api/bookings?start_date=${DATE}&end_date=${DATE}`).set(auth(t));
      expect(res.status).toBe(200);
      const got = listIds(res);
      for (const id of [...Object.values(OWN()), ids.bOther, ids.bGroup, ids.bFamily]) expect(got.has(id)).toBe(true);
      const row = res.body.find((b) => b.id === ids.bOther);
      expect(row.created_by_email).toContain('@vis.test');
      const group = res.body.find((b) => b.id === ids.bGroup);
      expect(group.participants.every((p) => typeof p.userEmail === 'string')).toBe(true);
    }
  });

  test('instructor scope unchanged: sees the lessons they teach', async () => {
    const res = await request(app).get(`/api/bookings?start_date=${DATE}&end_date=${DATE}`).set(auth(tok.instructor));
    expect(res.status).toBe(200);
    expect(listIds(res).has(ids.bOther)).toBe(true);
  });
});

describe('GET /api/bookings/:id', () => {
  test.each(CUSTOMER_KEYS)("%s cannot read someone else's booking (403 NOT_YOUR_BOOKING)", async (who) => {
    const res = await request(app).get(`/api/bookings/${ids.bOther}`).set(auth(tok[who]));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_YOUR_BOOKING');
  });

  test.each(CUSTOMER_KEYS)('%s can read own booking, stripped of staff fields', async (who) => {
    const res = await request(app).get(`/api/bookings/${OWN()[who]}`).set(auth(tok[who]));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(OWN()[who]);
    for (const k of ['instructor_email', 'instructor_commission', 'commission_type']) expect(res.body).not.toHaveProperty(k);
  });

  test('participant and family parent can read their bookings', async () => {
    expect((await request(app).get(`/api/bookings/${ids.bGroup}`).set(auth(tok.participant))).status).toBe(200);
    const fam = await request(app).get(`/api/bookings/${ids.bFamily}`).set(auth(tok.parent));
    expect(fam.status).toBe(200);
    expect(fam.body).not.toHaveProperty('student_email'); // the student column is not the parent
  });

  test('staff still read any booking with full fields', async () => {
    const res = await request(app).get(`/api/bookings/${ids.bOther}`).set(auth(tok.admin));
    expect(res.status).toBe(200);
    expect(res.body.instructor_email).toContain('@vis.test');
  });
});

describe('GET /api/bookings/calendar', () => {
  test.each(CUSTOMER_KEYS)('%s only gets own bookings', async (who) => {
    const res = await request(app).get(`/api/bookings/calendar?date=${DATE}`).set(auth(tok[who]));
    expect(res.status).toBe(200);
    const got = listIds(res);
    expect(got.has(OWN()[who])).toBe(true);
    expect(got.has(ids.bOther)).toBe(false);
    // the student is also primary on the semi-private booking
    const allowed = new Set([OWN()[who], ...(who === 'student' ? [ids.bGroup] : [])]);
    expect([...got].every((id) => allowed.has(id))).toBe(true);
  });

  test('staff calendar is unchanged (all bookings of the day)', async () => {
    const res = await request(app).get(`/api/bookings/calendar?date=${DATE}`).set(auth(tok.admin));
    expect(res.status).toBe(200);
    const got = listIds(res);
    for (const id of [...Object.values(OWN()), ids.bOther, ids.bGroup, ids.bFamily]) expect(got.has(id)).toBe(true);
  });
});

describe('staff-only booking endpoints', () => {
  test.each(CUSTOMER_KEYS)('%s cannot reach deleted/list or pending-transfers', async (who) => {
    for (const url of ['/api/bookings/deleted/list', '/api/bookings/pending-transfers']) {
      const res = await request(app).get(url).set(auth(tok[who]));
      expect(res.status).toBe(403);
    }
  });

  test('student no longer reaches staff GETs through the services:read JSONB fallback', async () => {
    for (const url of ['/api/accommodation/bookings', '/api/accommodation/package-stays', '/api/form-submissions']) {
      const res = await request(app).get(url).set(auth(tok.student));
      expect(res.status).toBe(403);
    }
  });

  test('staff still reach deleted/list and pending-transfers', async () => {
    for (const t of [tok.admin, tok.receptionist]) {
      expect((await request(app).get('/api/bookings/deleted/list').set(auth(t))).status).toBe(200);
      expect((await request(app).get('/api/bookings/pending-transfers').set(auth(t))).status).toBe(200);
    }
  });

  test('instructor still gets STAFF_ONLY on deleted/list', async () => {
    const res = await request(app).get('/api/bookings/deleted/list').set(auth(tok.instructor));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('STAFF_ONLY');
  });
});

describe('GET /api/rentals/user/:userId', () => {
  test("outsider cannot list another user's rentals", async () => {
    const res = await request(app).get(`/api/rentals/user/${ids.other}`).set(auth(tok.outsider));
    expect(res.status).toBe(403);
  });

  test('outsider can list own rentals; staff any', async () => {
    expect((await request(app).get(`/api/rentals/user/${ids.outsider}`).set(auth(tok.outsider))).status).toBe(200);
    expect((await request(app).get(`/api/rentals/user/${ids.other}`).set(auth(tok.admin))).status).toBe(200);
  });
});

describe('socket fan-out (no booking rows on the general channel)', () => {
  function fakeIo() {
    const emitted = [];
    return {
      emitted,
      to(rooms) {
        const target = { rooms: [].concat(rooms), except: [] };
        const op = {
          except(r) { target.except = [].concat(r); return op; },
          emit(event, data) { emitted.push({ ...target, event, data }); },
        };
        return op;
      },
    };
  }

  test('emitBookingEvent targets staff rooms, instructor, parties and notify ids only', () => {
    const io = fakeIo();
    const realIo = socketService.io;
    socketService.io = io;
    try {
      socketService.emitBookingEvent('booking:updated', {
        id: 'b1', date: DATE, start_hour: 9, duration: 1, status: 'confirmed', notes: 'secret',
        instructor_user_id: 'I1', student_user_id: 'S1', created_by_email: 'staff@x',
        participants: [
          { userId: 'S1', userEmail: 's1@x', userPhone: '1' },
          { userId: 'P1', userEmail: 'p1@x', userPhone: '2' },
        ],
      }, { notifyUserIds: ['I0', 'S1'] });
    } finally {
      socketService.io = realIo;
    }
    const all = io.emitted;
    expect(all.some((e) => e.rooms.includes('general'))).toBe(false);

    const full = all.find((e) => e.rooms.includes('role:admin'));
    expect(full.rooms).toEqual(expect.arrayContaining(['role:manager', 'role:receptionist', 'role:front_desk', 'role:owner', 'user:I1']));
    expect(full.rooms).not.toContain('role:student');
    expect(full.rooms).not.toContain('role:outsider');
    expect(full.data.created_by_email).toBe('staff@x');

    const s1 = all.find((e) => e.rooms[0] === 'user:S1');
    expect(s1.except).toEqual(expect.arrayContaining(['role:admin', 'user:I1']));
    expect(s1.data).not.toHaveProperty('created_by_email');
    expect(s1.data.participants.find((p) => p.userId === 'S1').userEmail).toBe('s1@x');
    expect(s1.data.participants.find((p) => p.userId === 'P1')).not.toHaveProperty('userEmail');

    const p1 = all.find((e) => e.rooms[0] === 'user:P1');
    expect(p1.data.participants.find((p) => p.userId === 'S1')).not.toHaveProperty('userPhone');

    // previous instructor: id/date/time/status only; S1 is already a party so not duplicated
    const i0 = all.filter((e) => e.rooms[0] === 'user:I0');
    expect(i0).toHaveLength(1);
    expect(Object.keys(i0[0].data).sort()).toEqual(['date', 'duration', 'id', 'instructor_user_id', 'start_hour', 'status', 'timestamp']);
    expect(all.filter((e) => e.rooms[0] === 'user:S1')).toHaveLength(1);
  });

  test('PUT /api/bookings/:id emits booking:updated to staff + parties, never general', async () => {
    const io = fakeIo();
    const realIo = socketService.io;
    socketService.io = io;
    try {
      const res = await request(app).put(`/api/bookings/${ids.bStudent}`).set(auth(tok.admin))
        .send({ notes: 'moved', instructor_user_id: ids.instructor2 });
      expect(res.status).toBe(200);
    } finally {
      socketService.io = realIo;
    }
    const updates = io.emitted.filter((e) => e.event === 'booking:updated');
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.some((e) => e.rooms.includes('general'))).toBe(false);
    const full = updates.find((e) => e.rooms.includes('role:admin'));
    expect(full.rooms).toContain(`user:${ids.instructor2}`);
    expect(full.data.id).toBe(ids.bStudent);
    const student = updates.find((e) => e.rooms[0] === `user:${ids.student}`);
    expect(student).toBeDefined();
    // the instructor who lost the lesson gets an id-only event (calendar drops it)
    const previous = updates.find((e) => e.rooms[0] === `user:${ids.instructor}`);
    expect(previous).toBeDefined();
    expect(previous.data).not.toHaveProperty('notes');
    expect(previous.data.instructor_user_id).toBe(ids.instructor2);
  });
});
