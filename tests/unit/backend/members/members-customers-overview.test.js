// Members + Customers overview endpoints:
//   GET  /api/member-offerings/admin/stats
//   GET  /api/member-offerings/admin/purchases?status=   (effective, expiry-aware)
//   POST /api/member-offerings/admin/purchases/remind
//   GET  /api/users/customers/segments
//   GET  /api/users/customers/list?insights=1&withTotal=1&segment=
//
// Integration suite against the LOCAL dev DB. The stats are school-wide, so the
// membership assertions compare before/after deltas of this run's own fixtures.
// Fixtures carry a random RUN tag and are removed in afterAll. Reminders go
// through the real in-app dispatcher and are checked in the notifications table.
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

let app;
let pool;
let stats;

const RUN = crypto.randomBytes(4).toString('hex');
const ids = {};
const tok = {};
const UNIT = 90000 + crypto.randomInt(0, 9000); // storage box numbers nobody else uses
const DAY_MS = 24 * 3600 * 1000;
const at = (days) => new Date(Date.now() + days * DAY_MS).toISOString();

const token = (id, role) =>
  jwt.sign({ id, email: `${role}-${RUN}@members.test`, role }, process.env.JWT_SECRET || 'plannivo-jwt-secret-key', { expiresIn: '1h' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function createUser(roleName, first) {
  const { rows: [role] } = await pool.query('SELECT id FROM roles WHERE name = $1', [roleName]);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (name, first_name, last_name, email, password_hash, role_id)
     VALUES ($1, $2, $3, $4, 'x', $5) RETURNING id`,
    [`${first} M${RUN}`, first, `M${RUN}`, `${first.toLowerCase()}-${RUN}@members.test`, role.id],
  );
  return user.id;
}

async function addOffering({ name, category = 'membership', groupKey = null, days }) {
  const { rows: [o] } = await pool.query(
    `INSERT INTO member_offerings (name, price, period, category, group_key, duration_days, is_active)
     VALUES ($1, 50, 'day', $2, $3, $4, false) RETURNING id`,
    [`${name} ${RUN}`, category, groupKey, days],
  );
  return o.id;
}

async function addPurchase({ offering, status = 'active', purchased = at(-3), expires, unit = null, price = 50 }) {
  const { rows: [p] } = await pool.query(
    `INSERT INTO member_purchases (user_id, offering_id, offering_name, offering_price, offering_currency,
                                   purchased_at, expires_at, status, storage_unit)
     VALUES ($1, $2, $3, $4, 'EUR', $5, $6, $7, $8) RETURNING id`,
    [ids.customer, offering, `Fixture ${RUN}`, price, purchased, expires, status, unit],
  );
  return p.id;
}

let before;

beforeAll(async () => {
  ({ default: app } = await import('../../../../backend/server.js'));
  ({ pool } = await import('../../../../backend/db.js'));
  stats = await import('../../../../backend/services/membershipStatsService.js');

  ids.manager = await createUser('manager', 'Mila');
  ids.customer = await createUser('student', 'Cleo');
  ids.other = await createUser('student', 'Otto');
  tok.manager = token(ids.manager, 'manager');
  tok.student = token(ids.customer, 'student');

  before = await stats.getMembershipStats();

  ids.storage = await addOffering({ name: 'Storage week', category: 'storage', days: 7 });
  ids.beach = await addOffering({ name: 'Beach day', groupKey: 'beach_pass', days: 1 });
  ids.endingSoon = await addPurchase({ offering: ids.storage, expires: at(3), unit: UNIT }); // active, ends in 3 days
  ids.staleActive = await addPurchase({ offering: ids.beach, purchased: at(-12), expires: at(-10) }); // stored 'active', really expired
  ids.longActive = await addPurchase({ offering: ids.beach, expires: at(60) });
  ids.cancelled = await addPurchase({ offering: ids.beach, status: 'cancelled', expires: at(20) });
  ids.upcoming = await addPurchase({ offering: ids.storage, purchased: at(5), expires: at(12), unit: UNIT + 1 });
}, 30000);

afterAll(async () => {
  if (!pool) return;
  const users = [ids.manager, ids.customer, ids.other].filter(Boolean);
  const cleanup = [
    ['DELETE FROM member_purchases WHERE user_id = ANY($1::uuid[])', [users]],
    ['DELETE FROM member_offerings WHERE name LIKE $1', [`% ${RUN}`]],
    ['DELETE FROM notifications WHERE user_id = ANY($1::uuid[])', [users]],
    ['DELETE FROM wallet_transactions WHERE user_id = ANY($1::uuid[])', [users]],
    ['DELETE FROM wallet_balances WHERE user_id = ANY($1::uuid[])', [users]],
    ['DELETE FROM users WHERE id = ANY($1::uuid[])', [users]],
  ];
  for (const [sql, params] of cleanup) {
    try { await pool.query(sql, params); } catch { /* best-effort cleanup */ }
  }
}, 30000);

describe('getMembershipStats (service)', () => {
  let after;
  beforeAll(async () => { after = await stats.getMembershipStats(); });

  test('counts the fixtures by EFFECTIVE status (stale "active" past expiry is expired)', () => {
    expect(after.total - before.total).toBe(5);
    expect(after.active - before.active).toBe(3); // endingSoon, longActive, upcoming
    expect(after.expired - before.expired).toBe(1); // staleActive
    expect(after.expiredRecent - before.expiredRecent).toBe(1);
    expect(after.cancelled - before.cancelled).toBe(1);
    expect(after.expiring7 - before.expiring7).toBe(1);
    expect(after.upcoming - before.upcoming).toBe(1);
  });

  test('families come from the offering (storage category, beach_pass group)', () => {
    expect(after.storage.memberships - before.storage.memberships).toBe(2);
    expect(after.beach.memberships - before.beach.memberships).toBe(3);
    expect(after.beach.active - before.beach.active).toBe(1);
    const week = after.types.find((t) => t.key === 'storage:week');
    expect(week).toBeTruthy();
    expect(after.types.find((t) => t.key === 'beach:day')).toBeTruthy();
  });

  test('box map marks the ending box and the future one', () => {
    const ending = after.storage.boxes.find((b) => b.unit === UNIT);
    const starting = after.storage.boxes.find((b) => b.unit === UNIT + 1);
    expect(ending).toMatchObject({ state: 'ending', holders: 1 });
    expect(ending.holder).toContain('Cleo');
    expect(starting).toMatchObject({ state: 'starting' });
    expect(after.storage.inUse - before.storage.inUse).toBe(2);
  });

  test('renewals due lists the membership ending this week only', () => {
    const due = after.renewalsDue.map((r) => r.id);
    expect(due).toContain(ids.endingSoon);
    expect(due).not.toContain(ids.longActive);
    expect(due).not.toContain(ids.staleActive);
    const row = after.renewalsDue.find((r) => r.id === ids.endingSoon);
    expect(row).toMatchObject({ userId: ids.customer, offeringId: ids.storage, storageUnit: UNIT, family: 'storage' });
  });

  test('purchaseStatusWhere rejects unknown values', () => {
    expect(stats.purchaseStatusWhere('nope')).toBeNull();
    expect(stats.purchaseStatusWhere('expired')).toContain("'expired'");
  });
});

describe('GET /api/member-offerings/admin/stats', () => {
  test('staff get the overview', async () => {
    const res = await request(app).get('/api/member-offerings/admin/stats').set(auth(tok.manager));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      total: expect.any(Number), active: expect.any(Number), storage: expect.any(Object), renewalsDue: expect.any(Array),
    }));
  });

  test('students are refused', async () => {
    const res = await request(app).get('/api/member-offerings/admin/stats').set(auth(tok.student));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/member-offerings/admin/purchases?status=', () => {
  const mine = (body) => body.filter((p) => p.user_id === ids.customer).map((p) => p.id);

  test('expired returns the stale "active" row, not the live one', async () => {
    const res = await request(app).get('/api/member-offerings/admin/purchases?status=expired').set(auth(tok.manager));
    expect(res.status).toBe(200);
    expect(mine(res.body)).toEqual([ids.staleActive]);
    expect(res.body.find((p) => p.id === ids.staleActive).computed_status).toBe('expired');
  });

  test('active excludes expired and cancelled', async () => {
    const res = await request(app).get('/api/member-offerings/admin/purchases?status=active').set(auth(tok.manager));
    expect(mine(res.body).sort()).toEqual([ids.endingSoon, ids.longActive, ids.upcoming].sort());
  });

  test('expiring honours expiringDays', async () => {
    const res = await request(app).get('/api/member-offerings/admin/purchases?status=expiring&expiringDays=7').set(auth(tok.manager));
    expect(mine(res.body)).toEqual([ids.endingSoon]);
  });

  test('rows carry name, family and duration', async () => {
    const res = await request(app).get('/api/member-offerings/admin/purchases').set(auth(tok.manager));
    const row = res.body.find((p) => p.id === ids.endingSoon);
    expect(row).toMatchObject({ offering_family: 'storage', offering_duration: 'week', user_name: `Cleo M${RUN}` });
  });

  test('an unknown status is a 400', async () => {
    const res = await request(app).get('/api/member-offerings/admin/purchases?status=bogus').set(auth(tok.manager));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/member-offerings/admin/purchases/remind', () => {
  test('sends an in-app reminder per live membership and skips cancelled ones', async () => {
    const res = await request(app)
      .post('/api/member-offerings/admin/purchases/remind')
      .set(auth(tok.manager))
      .send({ purchaseIds: [ids.endingSoon, ids.cancelled] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requested: 2, sent: 1, skipped: 1 });
    const { rows } = await pool.query(
      "SELECT type, data, idempotency_key FROM notifications WHERE user_id = $1 AND data->>'kind' = 'membership_renewal'",
      [ids.customer],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('general');
    expect(rows[0].data).toMatchObject({ memberPurchaseId: ids.endingSoon, kind: 'membership_renewal' });
    expect(rows[0].idempotency_key).toMatch(new RegExp(`^membership-renewal:${ids.endingSoon}:[0-9]{4}-[0-9]{2}-[0-9]{2}$`));
  });

  test('a second reminder on the same day is not sent twice', async () => {
    const res = await request(app)
      .post('/api/member-offerings/admin/purchases/remind')
      .set(auth(tok.manager))
      .send({ purchaseIds: [ids.endingSoon] });
    expect(res.status).toBe(200);
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND data->>'kind' = 'membership_renewal'",
      [ids.customer],
    );
    expect(rows[0].n).toBe(1);
  });

  test('validates the id list', async () => {
    const res = await request(app).post('/api/member-offerings/admin/purchases/remind').set(auth(tok.manager)).send({ purchaseIds: [] });
    expect(res.status).toBe(400);
  });

  test('students are refused', async () => {
    const res = await request(app).post('/api/member-offerings/admin/purchases/remind').set(auth(tok.student)).send({ purchaseIds: [ids.endingSoon] });
    expect(res.status).toBe(403);
  });
});

describe('Customers overview', () => {
  test('GET /api/users/customers/segments returns the segment counts', async () => {
    const res = await request(app).get('/api/users/customers/segments').set(auth(tok.manager));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      total: expect.any(Number),
      roles: expect.objectContaining({ students: expect.any(Number) }),
      segments: expect.objectContaining({ lessons: expect.any(Number), shop: expect.any(Number), members: expect.any(Number) }),
      owes: expect.objectContaining({ count: expect.any(Number) }),
      active30: expect.any(Number),
    }));
    expect(res.body.segments.members).toBeGreaterThanOrEqual(1);
  });

  test('segments are staff-only', async () => {
    const res = await request(app).get('/api/users/customers/segments').set(auth(tok.student));
    expect(res.status).toBe(403);
  });

  test('list with insights: segments, spend, real total', async () => {
    const res = await request(app)
      .get(`/api/users/customers/list?insights=1&withTotal=1&q=M${RUN}&sortBy=lifetime_spend&sortDir=desc`)
      .set(auth(tok.manager));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2); // Cleo + Otto (the manager is not a customer)
    const [first, second] = res.body.items;
    expect(first.id).toBe(ids.customer);
    expect(first.segments).toContain('member_active');
    expect(first.lifetime_spend).toBe(200); // four non-cancelled purchases × 50
    expect(first.last_activity_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(second.id).toBe(ids.other);
    expect(second.segments).toEqual([]);
  });

  test('segment filter narrows the list and the total', async () => {
    const res = await request(app)
      .get(`/api/users/customers/list?insights=1&withTotal=1&q=M${RUN}&segment=members`)
      .set(auth(tok.manager));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items.map((c) => c.id)).toEqual([ids.customer]);
    const none = await request(app)
      .get(`/api/users/customers/list?insights=1&withTotal=1&q=M${RUN}&segment=none`)
      .set(auth(tok.manager));
    expect(none.body.items.map((c) => c.id)).toEqual([ids.other]);
  });

  test('activity filter: active member counts as active', async () => {
    const res = await request(app)
      .get(`/api/users/customers/list?insights=1&withTotal=1&q=M${RUN}&activity=inactive`)
      .set(auth(tok.manager));
    expect(res.body.items.map((c) => c.id)).toEqual([ids.other]);
  });

  test('an unknown segment is a 400', async () => {
    const res = await request(app).get('/api/users/customers/list?insights=1&segment=bogus').set(auth(tok.manager));
    expect(res.status).toBe(400);
  });

  test('without insights the response shape is unchanged (other consumers)', async () => {
    const res = await request(app).get(`/api/users/customers/list?q=M${RUN}`).set(auth(tok.manager));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeUndefined();
    expect(res.body.items[0].segments).toBeUndefined();
    expect(res.body.items[0]).toEqual(expect.objectContaining({ id: expect.any(String), name: expect.any(String), balance: expect.any(Number) }));
  });
});
