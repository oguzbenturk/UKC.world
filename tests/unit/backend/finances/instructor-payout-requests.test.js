// Instructor earnings + payout requests (spec docs/specs/instructor-earnings-payouts.md).
//
// Integration suite: hits the real LOCAL dev DB through server.js (seeded
// throw-away users / bookings / ledger rows, removed in afterAll). The unified
// notification dispatcher is mocked so we can assert the staff / instructor
// notification calls without writing notifications or sending Telegram.
import { jest, describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import Decimal from 'decimal.js';

let app;
let pool;
let dispatcher;
let socketService;
let payoutService;

const RUN = crypto.randomBytes(4).toString('hex');
const ids = {};
let tryRate;
let today;

const token = (id, role) =>
  jwt.sign({ id, email: `${role}-${RUN}@payout.test`, role }, process.env.JWT_SECRET || 'plannivo-jwt-secret-key', { expiresIn: '1h' });

async function createUser(roleName, first) {
  const { rows: [role] } = await pool.query('SELECT id FROM roles WHERE name = $1', [roleName]);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (name, first_name, last_name, email, password_hash, role_id)
     VALUES ($1, $2, 'Payout', $3, 'x', $4) RETURNING id`,
    [`${first} Payout`, first, `${first.toLowerCase()}-${RUN}@payout.test`, role.id],
  );
  return user.id;
}

async function addLesson(instructorId, date, hours) {
  await pool.query(
    `INSERT INTO bookings (date, start_hour, duration, status, payment_status, amount, final_amount, currency, instructor_user_id)
     VALUES ($1, 10, $2, 'completed', 'paid', 100, 100, 'EUR', $3)`,
    [date, hours, instructorId],
  );
}

async function addLedgerRow(instructorId, { amount, currency = 'EUR', type, date, method = 'cash' }) {
  await pool.query(
    `INSERT INTO wallet_transactions
       (user_id, amount, currency, transaction_type, direction, status, available_delta, payment_method,
        description, entity_type, related_entity_type, related_entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, 'completed', 0, $6, $7, 'instructor_payment', 'instructor', $1, $8::jsonb)`,
    [instructorId, amount, currency, type, amount >= 0 ? 'credit' : 'debit', method, `seed ${type}`,
      JSON.stringify({ paymentDate: `${date}T09:00:00.000Z`, seed: RUN })],
  );
}

beforeAll(async () => {
  process.env.INSTRUCTOR_PAYOUT_THRESHOLD = '200';

  await jest.unstable_mockModule('../../../../backend/services/notificationDispatcherUnified.js', () => ({
    dispatchNotification: jest.fn(async () => ({ sent: true, id: 'mock' })),
    dispatchToStaff: jest.fn(async () => ({ notified: 2, skipped: 0 })),
    clearPreferenceCache: jest.fn(),
    NOTIFICATION_TYPES: new Set(),
    PREFERENCE_MAP: {},
    default: {},
  }));

  ({ default: app } = await import('../../../../backend/server.js'));
  ({ pool } = await import('../../../../backend/db.js'));
  dispatcher = await import('../../../../backend/services/notificationDispatcherUnified.js');
  ({ default: socketService } = await import('../../../../backend/services/socketService.js'));
  payoutService = await import('../../../../backend/services/instructorPayoutService.js');
  today = payoutService.businessDate();

  const { rows: [rate] } = await pool.query(
    `SELECT exchange_rate FROM currency_settings WHERE currency_code = 'TRY' AND is_active = true`,
  );
  tryRate = Number(rate?.exchange_rate || 1);

  ids.admin = await createUser('admin', 'Admin');
  ids.a = await createUser('instructor', 'Alice');
  ids.b = await createUser('instructor', 'Bob');
  ids.student = await createUser('student', 'Stu');

  for (const id of [ids.a, ids.b]) {
    await pool.query(
      `INSERT INTO instructor_default_commissions (instructor_id, commission_type, commission_value) VALUES ($1, 'fixed', 50)`,
      [id],
    );
  }
  // Alice: 4 lessons at €50/h fixed → 100 + 100 + 150 + 200 = 550 earned.
  await addLesson(ids.a, '2026-01-10', 2);
  await addLesson(ids.a, '2026-02-10', 2);
  await addLesson(ids.a, '2026-03-05', 3);
  await addLesson(ids.a, today, 4);
  // Ledger: €100 payment, a TRY payment worth €50, a €20 deduction (stored negative).
  await addLedgerRow(ids.a, { amount: 100, type: 'payment', date: '2026-02-01', method: 'bank_transfer' });
  await addLedgerRow(ids.a, { amount: Number((50 * tryRate).toFixed(2)), currency: 'TRY', type: 'payment', date: '2026-02-15', method: 'cash' });
  await addLedgerRow(ids.a, { amount: -20, type: 'deduction', date: '2026-03-01' });
  // Bob: one 1h lesson → €50 available (below the €200 threshold).
  await addLesson(ids.b, '2026-02-20', 1);

  ids.tokens = {
    admin: token(ids.admin, 'admin'),
    a: token(ids.a, 'instructor'),
    b: token(ids.b, 'instructor'),
    student: token(ids.student, 'student'),
  };
});

afterAll(async () => {
  const users = [ids.admin, ids.a, ids.b, ids.student].filter(Boolean);
  if (!pool || !users.length) return;
  const cleanup = [
    'DELETE FROM instructor_payout_requests WHERE instructor_id = ANY($1::uuid[])',
    'DELETE FROM wallet_transactions WHERE user_id = ANY($1::uuid[])',
    'DELETE FROM wallet_balances WHERE user_id = ANY($1::uuid[])',
    'DELETE FROM bookings WHERE instructor_user_id = ANY($1::uuid[])',
    'DELETE FROM instructor_default_commissions WHERE instructor_id = ANY($1::uuid[])',
    'DELETE FROM users WHERE id = ANY($1::uuid[])',
  ];
  for (const sql of cleanup) {
    try { await pool.query(sql, [users]); } catch { /* best-effort cleanup */ }
  }
}, 30000);

beforeEach(() => {
  dispatcher.dispatchNotification.mockClear();
  dispatcher.dispatchToStaff.mockClear();
});

const api = (method, url, who) => request(app)[method](url).set('Authorization', `Bearer ${ids.tokens[who]}`);

describe('FIFO helper', () => {
  test('net payouts cover the oldest lessons first; partially covered lesson stays pending', () => {
    const mk = (id, date, amount) => ({ id, date, startHour: 10, amount: new Decimal(amount) });
    const statuses = payoutService.deriveFifoStatuses(
      [mk('l3', '2026-03-01', 150), mk('l1', '2026-01-01', 100), mk('l2', '2026-02-01', 100)],
      130,
    );
    expect(statuses.get('l1')).toBe('paid');
    expect(statuses.get('l2')).toBe('pending');
    expect(statuses.get('l3')).toBe('pending');
  });
});

describe('GET /api/instructors/me/earnings-summary', () => {
  test('all-time numbers on the seeded ledger (TRY row converted, deduction netted)', async () => {
    const res = await api('get', '/api/instructors/me/earnings-summary?period=all', 'a');
    expect(res.status).toBe(200);
    const s = res.body;
    expect(s.currency).toBe('EUR');
    expect(s.period).toMatchObject({ key: 'all', start: null, end: null });
    expect(s.earned).toBe(530); // NET: 550 lesson earnings − 20 deduction
    expect(s.previousEarned).toBeNull();
    expect(s.changePct).toBeNull();
    expect(s.lessons).toBe(4);
    expect(s.hours).toBe(11);
    expect(s.avgPerLesson).toBe(137.5);
    expect(s.deductions).toBe(20);
    expect(s.balances.totalEarned).toBe(550);
    expect(s.balances.paidOutGross).toBeCloseTo(150, 2);
    expect(s.balances.deductionsTotal).toBe(20);
    // A deduction is a charge (owner decision 2026-10-08): it settles earnings
    // like a payout instead of being netted off the payouts.
    expect(s.balances.paidOutNet).toBeCloseTo(150, 2);
    expect(s.balances.settled).toBeCloseTo(170, 2);
    expect(s.balances.spentInApp).toBe(0);
    expect(s.balances.available).toBeCloseTo(380, 2); // 550 − 150 paid − 20 deducted
    expect(s.threshold).toEqual({ amount: 200, meets: true, shortfall: 0 });
    expect(s.lastPayout).toMatchObject({ date: '2026-02-15', method: 'cash' });
    expect(s.lastPayout.amount).toBeCloseTo(50, 2);
    expect(s.pendingRequest).toBeNull();
    expect(s.weekly).toHaveLength(12);
    expect(s.monthly).toHaveLength(6);
    expect(s.byLessonType).toEqual([
      expect.objectContaining({ key: 'other', label: 'Other', commissionType: 'fixed', rate: 50, lessons: 4, hours: 11, amount: 550 }),
    ]);
  });

  test('invariant: Σ byLessonType.amount − deductions = earned (every period)', async () => {
    for (const period of ['week', 'month', 'year', 'all']) {
      const { body } = await api('get', `/api/instructors/me/earnings-summary?period=${period}`, 'a');
      const gross = body.byLessonType.reduce((acc, g) => acc.plus(g.amount), new Decimal(0));
      expect(gross.minus(body.deductions).toDecimalPlaces(2).toNumber()).toBe(body.earned);
      expect(body.deductions).toBeGreaterThanOrEqual(0);
    }
  });

  test('month period counts only the current month lesson', async () => {
    const res = await api('get', '/api/instructors/me/earnings-summary?period=month', 'a');
    expect(res.status).toBe(200);
    expect(res.body.period.start).toBe(`${today.slice(0, 7)}-01`);
    expect(res.body.earned).toBe(200);
    expect(res.body.lessons).toBe(1);
    expect(res.body.hours).toBe(4);
    expect(res.body.monthly[5]).toEqual({ month: today.slice(0, 7), total: 200 });
  });

  test('rejects an unknown period and non-instructor roles', async () => {
    expect((await api('get', '/api/instructors/me/earnings-summary?period=decade', 'a')).status).toBe(400);
    expect((await api('get', '/api/instructors/me/earnings-summary', 'student')).status).toBe(403);
  });
});

describe('GET /api/instructors/me/earnings-activity', () => {
  test('FIFO paid/pending on lessons + payout/deduction rows', async () => {
    const res = await api('get', '/api/instructors/me/earnings-activity?period=all&type=all', 'a');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(7);
    const lessons = res.body.items.filter((i) => i.kind === 'lesson');
    const byDate = Object.fromEntries(lessons.map((l) => [l.date, l.status]));
    expect(byDate['2026-01-10']).toBe('paid'); // 100 of the 170 settled (150 paid + 20 deducted)
    expect(byDate['2026-02-10']).toBe('pending'); // only 70 left
    expect(byDate['2026-03-05']).toBe('pending');
    expect(byDate[today]).toBe('pending');
    expect(res.body.items[0].date >= res.body.items[res.body.items.length - 1].date).toBe(true);
    const deduction = res.body.items.find((i) => i.kind === 'deduction');
    expect(deduction).toMatchObject({ date: '2026-03-01', amount: 20 });
    const payouts = res.body.items.filter((i) => i.kind === 'payout');
    expect(payouts).toHaveLength(2);
    expect(payouts.every((p) => p.status === 'paid')).toBe(true);
  });

  test('status filter is applied after FIFO and before pagination', async () => {
    const paid = await api('get', '/api/instructors/me/earnings-activity?period=all&status=paid', 'a');
    expect(paid.status).toBe(200);
    expect(paid.body.total).toBe(3); // the FIFO-paid lesson + 2 payouts
    expect(paid.body.items.every((i) => i.status === 'paid')).toBe(true);
    const pending = await api('get', '/api/instructors/me/earnings-activity?period=all&status=pending&limit=1', 'a');
    expect(pending.body.total).toBe(3);
    expect(pending.body.items).toHaveLength(1);
    expect((await api('get', '/api/instructors/me/earnings-activity?status=bogus', 'a')).status).toBe(400);
  });

  test('type / search / pagination filters', async () => {
    expect((await api('get', '/api/instructors/me/earnings-activity?period=all&type=lessons', 'a')).body.total).toBe(4);
    expect((await api('get', '/api/instructors/me/earnings-activity?period=all&type=payouts', 'a')).body.total).toBe(3);
    expect((await api('get', '/api/instructors/me/earnings-activity?period=all&search=zzz-nothing', 'a')).body.total).toBe(0);
    const page = await api('get', '/api/instructors/me/earnings-activity?period=all&limit=2&offset=1', 'a');
    expect(page.body.items).toHaveLength(2);
    expect(page.body.total).toBe(7);
  });
});

describe('payout request lifecycle', () => {
  let firstId;

  test('validates amount and available balance', async () => {
    const zero = await api('post', '/api/instructors/me/payout-requests', 'a').send({ amount: 0 });
    expect(zero.status).toBe(400);
    const tooMuch = await api('post', '/api/instructors/me/payout-requests', 'a').send({ amount: 500 });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.code).toBe('AMOUNT_ABOVE_AVAILABLE');
    const belowThreshold = await api('post', '/api/instructors/me/payout-requests', 'a').send({ amount: 150 });
    expect(belowThreshold.status).toBe(400);
    expect(belowThreshold.body.code).toBe('AMOUNT_BELOW_THRESHOLD');
    expect(dispatcher.dispatchToStaff).not.toHaveBeenCalled();
  });

  test('below the threshold is refused', async () => {
    const res = await api('post', '/api/instructors/me/payout-requests', 'b').send({ amount: 40 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BELOW_THRESHOLD');
  });

  test('students cannot request payouts', async () => {
    expect((await api('post', '/api/instructors/me/payout-requests', 'student').send({ amount: 10 })).status).toBe(403);
  });

  test('creates a request and notifies admins + managers (in-app + Telegram via dispatcher) and emits the socket event', async () => {
    const emitSpy = jest.spyOn(socketService, 'emitToChannel');
    const roleSpy = jest.spyOn(socketService, 'emitToRole');
    const res = await api('post', '/api/instructors/me/payout-requests', 'a')
      .send({ amount: 300, preferredMethod: 'bank_transfer', note: 'Rent' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ amount: 300, currency: 'EUR', status: 'pending', preferredMethod: 'bank_transfer', note: 'Rent', instructorId: ids.a });
    firstId = res.body.id;

    expect(dispatcher.dispatchToStaff).toHaveBeenCalledTimes(1);
    const call = dispatcher.dispatchToStaff.mock.calls[0][0];
    expect(call.type).toBe('payout_request_created');
    expect(call.roles).toEqual(['admin', 'manager']);
    expect(call.message).toContain('€300.00');
    expect(call.message).toContain('€380.00');
    expect(call.data).toMatchObject({ payoutRequestId: firstId, amount: 300, available: 380, cta: { href: '/finance/payout-requests' } });
    expect(emitSpy).toHaveBeenCalledWith(`user:${ids.a}`, 'payout_request:updated',
      expect.objectContaining({ id: firstId, status: 'pending', instructorId: ids.a, amount: 300 }));
    expect(roleSpy).toHaveBeenCalledWith('admin', 'payout_request:updated', expect.any(Object));
    expect(roleSpy).toHaveBeenCalledWith('manager', 'payout_request:updated', expect.any(Object));
    emitSpy.mockRestore();
    roleSpy.mockRestore();
  });

  test('a second pending request is a 409 and the summary exposes the pending one', async () => {
    const dup = await api('post', '/api/instructors/me/payout-requests', 'a').send({ amount: 50 });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('PENDING_EXISTS');
    const summary = await api('get', '/api/instructors/me/earnings-summary?period=all', 'a');
    expect(summary.body.pendingRequest).toMatchObject({ id: firstId, amount: 300, note: 'Rent' });
  });

  test('own-only: another instructor cannot see or cancel it, nor use admin endpoints', async () => {
    const cancel = await api('delete', `/api/instructors/me/payout-requests/${firstId}`, 'b');
    expect(cancel.status).toBe(404);
    const list = await api('get', '/api/instructors/me/payout-requests', 'b');
    expect(list.status).toBe(200);
    expect(list.body.find((r) => r.id === firstId)).toBeUndefined();
    expect((await api('get', '/api/finances/payout-requests', 'a')).status).toBe(403);
    expect((await api('post', `/api/finances/payout-requests/${firstId}/pay`, 'a').send({ paymentMethod: 'cash' })).status).toBe(403);
  });

  test('admin list + pending count', async () => {
    const count = await api('get', '/api/finances/payout-requests/count?status=pending', 'admin');
    expect(count.status).toBe(200);
    expect(count.body.count).toBeGreaterThanOrEqual(1);
    const list = await api('get', '/api/finances/payout-requests?status=pending', 'admin');
    expect(list.status).toBe(200);
    const mine = list.body.find((r) => r.id === firstId);
    expect(mine).toMatchObject({ instructorName: 'Alice Payout', status: 'pending', amount: 300 });
    expect(mine.available).toBeCloseTo(380, 2);
  });

  test('reject requires a reason, then notifies the instructor', async () => {
    const noReason = await api('post', `/api/finances/payout-requests/${firstId}/reject`, 'admin').send({ reason: '  ' });
    expect(noReason.status).toBe(400);
    const res = await api('post', `/api/finances/payout-requests/${firstId}/reject`, 'admin').send({ reason: 'Too early in the month' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'rejected', adminNote: 'Too early in the month', decidedBy: ids.admin });
    expect(dispatcher.dispatchNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: ids.a,
      type: 'payout_request_rejected',
      message: expect.stringContaining('Too early in the month'),
    }));
    expect((await api('post', `/api/finances/payout-requests/${firstId}/reject`, 'admin').send({ reason: 'again' })).status).toBe(409);
  });

  test('instructor can cancel their own pending request', async () => {
    const created = await api('post', '/api/instructors/me/payout-requests', 'a').send({ amount: 300 });
    expect(created.status).toBe(201);
    const cancel = await api('delete', `/api/instructors/me/payout-requests/${created.body.id}`, 'a');
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('cancelled');
    expect((await api('delete', `/api/instructors/me/payout-requests/${created.body.id}`, 'a')).status).toBe(409);
  });

  test('admin pay records the instructor payment via the shared function and updates balances', async () => {
    const created = await api('post', '/api/instructors/me/payout-requests', 'a').send({ amount: 300 });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const paid = await api('post', `/api/finances/payout-requests/${id}/pay`, 'admin')
      .send({ paymentMethod: 'bank_transfer', referenceNumber: 'TR-123', note: 'October' });
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ status: 'paid', decidedBy: ids.admin, paidAmount: 300 });
    expect(paid.body.paymentId).toBeTruthy();

    const { rows: [tx] } = await pool.query('SELECT * FROM wallet_transactions WHERE id = $1', [paid.body.paymentId]);
    expect(tx).toMatchObject({ user_id: ids.a, entity_type: 'instructor_payment', transaction_type: 'payment', status: 'completed', payment_method: 'bank_transfer' });
    expect(Number(tx.amount)).toBe(300);
    expect(Number(tx.available_delta)).toBe(0);
    expect(tx.metadata).toMatchObject({ source: 'finances:instructor-payments:create', payoutRequestId: id, externalReference: 'TR-123' });

    expect(dispatcher.dispatchNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: ids.a,
      type: 'payout_request_paid',
      message: expect.stringContaining('€300.00'),
    }));

    const summary = await api('get', '/api/instructors/me/earnings-summary?period=all', 'a');
    expect(summary.body.balances.paidOutGross).toBeCloseTo(450, 2);
    expect(summary.body.balances.paidOutNet).toBeCloseTo(450, 2);
    expect(summary.body.balances.available).toBeCloseTo(80, 2); // 550 − 450 − 20
    expect(summary.body.threshold).toEqual({ amount: 200, meets: false, shortfall: 120 });
    expect(summary.body.lastPayout).toMatchObject({ amount: 300, method: 'bank_transfer', reference: 'TR-123' });
    expect(summary.body.pendingRequest).toBeNull();

    const activity = await api('get', '/api/instructors/me/earnings-activity?period=all&type=lessons', 'a');
    const byDate = Object.fromEntries(activity.body.items.map((l) => [l.date, l.status]));
    expect(byDate).toMatchObject({ '2026-01-10': 'paid', '2026-02-10': 'paid', '2026-03-05': 'paid', [today]: 'pending' });

    expect((await api('post', `/api/finances/payout-requests/${id}/pay`, 'admin').send({ paymentMethod: 'cash' })).status).toBe(409);
    const own = await api('get', '/api/instructors/me/payout-requests', 'a');
    expect(own.body.map((r) => r.status)).toEqual(['paid', 'cancelled', 'rejected']);
  });

  test('pay validates the payment method', async () => {
    const res = await api('post', `/api/finances/payout-requests/${firstId}/pay`, 'admin').send({});
    expect(res.status).toBe(400);
  });
});

describe('earnings statement + legacy instructor-payments endpoint', () => {
  test('CSV statement for a month; PDF is refused', async () => {
    const res = await api('get', '/api/instructors/me/earnings-statement?month=2026-01&format=csv', 'a');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('earnings-statement-2026-01.csv');
    expect(res.text).toContain('2026-01-10,lesson');
    const pdf = await api('get', '/api/instructors/me/earnings-statement?month=2026-01&format=pdf', 'a');
    expect(pdf.status).toBe(400);
    expect(pdf.body.code).toBe('FORMAT_NOT_SUPPORTED');
    expect((await api('get', '/api/instructors/me/earnings-statement?month=2026-13', 'a')).status).toBe(400);
  });

  test('POST /api/finances/instructor-payments still records the same ledger row', async () => {
    const res = await api('post', '/api/finances/instructor-payments', 'admin').send({
      instructor_id: ids.b, amount: 10, description: 'Manual payout', payment_date: '2026-03-10', payment_method: 'cash', type: 'payment',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { rows: [tx] } = await pool.query(
      `SELECT * FROM wallet_transactions WHERE user_id = $1 AND description = 'Manual payout'`, [ids.b],
    );
    expect(tx).toMatchObject({ entity_type: 'instructor_payment', transaction_type: 'payment', payment_method: 'cash' });
    expect(Number(tx.available_delta)).toBe(0);
    expect(tx.metadata).toMatchObject({ source: 'finances:instructor-payments:create', requestedType: 'payment', paymentDate: '2026-03-10T00:00:00.000Z' });
    expect(tx.metadata.payoutRequestId).toBeUndefined();
  });
});
