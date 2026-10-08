// Staff wallet (owner decisions 2026-10-08): earnings in My Wallet, deduction
// direction, "Pay with my earnings" at shop checkout, refunds, self-credit block.
//
// Integration suite against the LOCAL dev DB through server.js. Throw-away users,
// bookings, products, orders and ledger rows (unique per run) are removed in afterAll.
import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

let app;
let pool;
let earningsService;
let financeService;

const RUN = crypto.randomBytes(4).toString('hex');
const ids = {};
const orderIds = [];

const token = (id, role) =>
  jwt.sign({ id, email: `${role}-${RUN}@staffwallet.test`, role }, process.env.JWT_SECRET || 'plannivo-jwt-secret-key', { expiresIn: '1h' });

async function createUser(roleName, first) {
  const { rows: [role] } = await pool.query('SELECT id FROM roles WHERE name = $1', [roleName]);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (name, first_name, last_name, email, password_hash, role_id)
     VALUES ($1, $2, 'Wallet', $3, 'x', $4) RETURNING id`,
    [`${first} Wallet`, first, `${first.toLowerCase()}-${RUN}@staffwallet.test`, role.id],
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

async function addPayrollRow(userId, { amount, type, entity = 'instructor_payment', date = '2026-03-01' }) {
  await pool.query(
    `INSERT INTO wallet_transactions
       (user_id, amount, currency, transaction_type, direction, status, available_delta, payment_method,
        description, entity_type, related_entity_type, related_entity_id, metadata)
     VALUES ($1, $2, 'EUR', $3, $4, 'completed', 0, 'cash', $5, $6, $7, $1, $8::jsonb)`,
    [userId, amount, type, amount >= 0 ? 'credit' : 'debit', `seed ${type}`, entity,
      entity === 'manager_payment' ? 'manager' : 'instructor',
      JSON.stringify({ paymentDate: `${date}T09:00:00.000Z`, seed: RUN })],
  );
}

const walletAvailable = async (userId) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(available_amount), 0) AS v FROM wallet_balances WHERE user_id = $1`, [userId],
  );
  return Number(rows[0].v);
};

const api = (method, url, who) => request(app)[method](url).set('Authorization', `Bearer ${ids.tokens[who]}`);

const buy = (who, qty = 1, extra = {}) => api('post', '/api/shop-orders', who).send({
  items: [{ product_id: ids.product, quantity: qty }],
  payment_method: 'earnings',
  use_wallet: false,
  ...extra,
});

const remember = (res) => {
  if (res.body?.order?.id) orderIds.push(res.body.order.id);
  return res;
};

beforeAll(async () => {
  ({ default: app } = await import('../../../../backend/server.js'));
  ({ pool } = await import('../../../../backend/db.js'));
  earningsService = await import('../../../../backend/services/staffEarningsService.js');
  financeService = await import('../../../../backend/services/instructorFinanceService.js');

  ids.admin = await createUser('admin', 'Admin');
  ids.manager = await createUser('manager', 'Mona');
  ids.ina = await createUser('instructor', 'Ina');
  ids.rec = await createUser('receptionist', 'Remy');
  ids.student = await createUser('student', 'Stu');

  await pool.query(
    `INSERT INTO instructor_default_commissions (instructor_id, commission_type, commission_value) VALUES ($1, 'fixed', 50)`,
    [ids.ina],
  );
  // Ina: 2h + 4h at €50/h = €300 earned; €100 paid out, €20 deduction → €180 available.
  await addLesson(ids.ina, '2026-01-10', 2);
  await addLesson(ids.ina, '2026-02-10', 4);
  await addPayrollRow(ids.ina, { amount: 100, type: 'payment' });
  await addPayrollRow(ids.ina, { amount: -20, type: 'deduction' });

  // Mona (manager): €40 commission on one of Ina's (live) lessons, nothing paid.
  const { rows: [lesson] } = await pool.query(
    'SELECT id FROM bookings WHERE instructor_user_id = $1 ORDER BY date LIMIT 1', [ids.ina],
  );
  await pool.query(
    `INSERT INTO manager_commissions
       (manager_user_id, source_type, source_id, source_amount, commission_rate, commission_amount, period_month, source_date, status)
     VALUES ($1, 'booking', $2, 400, 10, 40, '2026-02', '2026-02-15', 'pending')`,
    [ids.manager, lesson.id],
  );

  const { rows: [product] } = await pool.query(
    `INSERT INTO products (name, category, price, stock_quantity, status)
     VALUES ($1, 'apparel', 50, 50, 'active') RETURNING id`,
    [`Staff wallet tee ${RUN}`],
  );
  ids.product = product.id;

  ids.tokens = {
    admin: token(ids.admin, 'admin'),
    manager: token(ids.manager, 'manager'),
    ina: token(ids.ina, 'instructor'),
    rec: token(ids.rec, 'receptionist'),
    student: token(ids.student, 'student'),
  };
});

afterAll(async () => {
  const users = [ids.admin, ids.manager, ids.ina, ids.rec, ids.student].filter(Boolean);
  if (!pool || !users.length) return;
  const { rows } = await pool.query('SELECT id FROM shop_orders WHERE user_id = ANY($1::uuid[])', [users]);
  const allOrders = [...new Set([...orderIds, ...rows.map((r) => r.id)])].map(String);
  const cleanup = [
    ['DELETE FROM manager_commissions WHERE source_type = \'shop\' AND source_id = ANY($1::text[])', [allOrders]],
    ['DELETE FROM manager_commissions WHERE manager_user_id = ANY($1::uuid[])', [users]],
    ['DELETE FROM shop_order_status_history WHERE order_id = ANY($1::int[])', [allOrders.map(Number)]],
    ['DELETE FROM shop_order_items WHERE order_id = ANY($1::int[])', [allOrders.map(Number)]],
    ['DELETE FROM shop_orders WHERE id = ANY($1::int[])', [allOrders.map(Number)]],
    ['DELETE FROM products WHERE id = $1', [ids.product]],
    ['DELETE FROM wallet_transactions WHERE user_id = ANY($1::uuid[])', [users]],
    ['DELETE FROM wallet_balances WHERE user_id = ANY($1::uuid[])', [users]],
    ['DELETE FROM bookings WHERE instructor_user_id = ANY($1::uuid[])', [users]],
    ['DELETE FROM instructor_default_commissions WHERE instructor_id = ANY($1::uuid[])', [users]],
    ['DELETE FROM user_tags WHERE user_id = ANY($1::uuid[])', [users]],
    ['DELETE FROM notifications WHERE user_id = ANY($1::uuid[])', [users]],
    ['DELETE FROM users WHERE id = ANY($1::uuid[])', [users]],
  ];
  for (const [sql, params] of cleanup) {
    try { await pool.query(sql, params); } catch { /* best-effort cleanup */ }
  }
}, 30000);

describe('earnings balance (deduction lowers what is owed)', () => {
  test('My Wallet summary carries the earnings block for an instructor', async () => {
    const res = await api('get', '/api/wallet/summary', 'ina');
    expect(res.status).toBe(200);
    expect(res.body.earnings).toMatchObject({
      currency: 'EUR', earned: 300, paidOut: 100, spentInApp: 0, deducted: 20, available: 180,
    });
  });

  test('earnings page, dashboard payments summary and the balances list agree (180)', async () => {
    const summary = await api('get', '/api/instructors/me/earnings-summary?period=all', 'ina');
    expect(summary.body.balances.available).toBeCloseTo(180, 2);
    const pay = await financeService.getInstructorPaymentsSummary(ids.ina);
    expect(pay.netPayments).toBeCloseTo(120, 2); // settled = 100 paid + 20 deducted
    expect(pay.totalPaid).toBeCloseTo(100, 2);
    const all = await financeService.getAllInstructorBalances();
    expect(all[ids.ina].balance).toBeCloseTo(180, 2);
  });

  test('manager earnings come from manager commissions', async () => {
    const res = await api('get', '/api/wallet/summary', 'manager');
    expect(res.body.earnings).toMatchObject({ earned: 40, paidOut: 0, available: 40 });
  });

  test('receptionist and student have no earnings block', async () => {
    expect((await api('get', '/api/wallet/summary', 'rec')).body.earnings).toBeNull();
    expect((await api('get', '/api/wallet/summary', 'student')).body.earnings).toBeNull();
    expect((await api('get', '/api/wallet/earnings-activity', 'rec')).body.items).toEqual([]);
  });

  test('earnings activity lists earned lessons, payout and deduction', async () => {
    const res = await api('get', '/api/wallet/earnings-activity', 'ina');
    expect(res.status).toBe(200);
    const kinds = res.body.items.map((i) => i.kind);
    expect(kinds.filter((k) => k === 'earned')).toHaveLength(2);
    expect(kinds).toEqual(expect.arrayContaining(['paid_out', 'deducted']));
  });
});

describe('Pay with my earnings at shop checkout', () => {
  test('rejected for roles without earnings and for someone else\'s order', async () => {
    const student = await buy('student');
    expect(student.status).toBe(403);
    expect(student.body.code).toBe('EARNINGS_NOT_AVAILABLE');
    expect((await buy('rec')).body.code).toBe('EARNINGS_NOT_AVAILABLE');
    const other = await buy('manager', 1, { user_id: ids.ina });
    expect(other.status).toBe(403);
    expect(other.body.code).toBe('EARNINGS_SELF_ONLY');
  });

  test('more than the available earnings → 400, nothing written', async () => {
    const res = await buy('ina', 4); // €200 > €180
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INSUFFICIENT_EARNINGS', available: 180, required: 200 });
    const { rows } = await pool.query(`SELECT 1 FROM wallet_transactions WHERE user_id = $1 AND payment_method = 'earnings'`, [ids.ina]);
    expect(rows).toHaveLength(0);
  });

  test('purchase is paid, settles earnings like a payout, never touches wallet credit', async () => {
    const walletBefore = await walletAvailable(ids.ina);
    const res = remember(await buy('ina', 1));
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ payment_method: 'earnings', payment_status: 'completed', status: 'confirmed' });

    const { rows: [spend] } = await pool.query(
      `SELECT * FROM wallet_transactions
        WHERE user_id = $1 AND entity_type = 'instructor_payment' AND payment_method = 'earnings'`, [ids.ina],
    );
    expect(spend).toMatchObject({ transaction_type: 'payment', status: 'completed' });
    expect(Number(spend.amount)).toBe(50);
    expect(Number(spend.available_delta)).toBe(0);
    expect(spend.metadata).toMatchObject({ kind: 'in_app_purchase', sourceType: 'shop_order', sourceId: String(res.body.order.id) });

    expect(await walletAvailable(ids.ina)).toBeCloseTo(walletBefore, 2);
    const summary = await api('get', '/api/wallet/summary', 'ina');
    expect(summary.body.earnings).toMatchObject({ spentInApp: 50, paidOut: 100, available: 130 });
    const page = await api('get', '/api/instructors/me/earnings-summary?period=all', 'ina');
    expect(page.body.balances).toMatchObject({ spentInApp: 50, available: 130 });
    // The last CASH payout is still the seeded one, not the purchase.
    expect(page.body.lastPayout?.method).not.toBe('earnings');
  });

  test('two checkouts at the same time cannot spend the same euros', async () => {
    // €130 available: two €100 orders in parallel → exactly one succeeds.
    const [a, b] = await Promise.all([buy('ina', 2), buy('ina', 2)]);
    remember(a); remember(b);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 400]);
    const summary = await api('get', '/api/wallet/summary', 'ina');
    expect(summary.body.earnings.available).toBeCloseTo(30, 2);
  });

  test('a second live spend for the same order is refused (idempotent)', async () => {
    const orderId = orderIds[0];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await expect(earningsService.recordEarningsSpend({
        client, userId: ids.ina, role: 'instructor', amount: 50,
        sourceType: 'shop_order', sourceId: orderId, description: 'dup', actorId: ids.ina,
      })).rejects.toMatchObject({ statusCode: 409, code: 'EARNINGS_ALREADY_SPENT' });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('refund (admin) gives the earnings back — no wallet credit — and cancels manager commission', async () => {
    const orderId = orderIds[0];
    const walletBefore = await walletAvailable(ids.ina);
    const before = (await api('get', '/api/wallet/summary', 'ina')).body.earnings.available;
    const res = await api('patch', `/api/shop-orders/${orderId}/status`, 'admin').send({ status: 'refunded' });
    expect(res.status).toBe(200);
    const after = (await api('get', '/api/wallet/summary', 'ina')).body.earnings.available;
    expect(after).toBeCloseTo(before + 50, 2);
    expect(await walletAvailable(ids.ina)).toBeCloseTo(walletBefore, 2);
    const { rows: [spend] } = await pool.query(
      `SELECT status FROM wallet_transactions WHERE payment_method = 'earnings' AND metadata->>'sourceId' = $1`, [String(orderId)],
    );
    expect(spend.status).toBe('cancelled');
    // cancelCommission is fire-and-forget; give it a moment.
    await new Promise((r) => setTimeout(r, 300));
    const { rows: live } = await pool.query(
      `SELECT 1 FROM manager_commissions WHERE source_type = 'shop' AND source_id = $1 AND status = 'pending'`, [String(orderId)],
    );
    expect(live).toHaveLength(0);
  });

  test('customer cancel of an earnings order also gives the earnings back', async () => {
    const created = remember(await buy('ina', 1));
    expect(created.status).toBe(201);
    const before = (await api('get', '/api/wallet/summary', 'ina')).body.earnings.available;
    const res = await api('post', `/api/shop-orders/${created.body.order.id}/cancel`, 'ina').send({ reason: 'changed my mind' });
    expect(res.status).toBe(200);
    const after = (await api('get', '/api/wallet/summary', 'ina')).body.earnings.available;
    expect(after).toBeCloseTo(before + 50, 2);
  });
});

describe('manual wallet credit', () => {
  test('receptionist can no longer use manual-adjust', async () => {
    const res = await api('post', '/api/wallet/manual-adjust', 'rec').send({ userId: ids.student, amount: 10 });
    expect(res.status).toBe(403);
  });

  test('nobody can credit their own wallet', async () => {
    const adj = await api('post', '/api/wallet/manual-adjust', 'manager').send({ userId: ids.manager, amount: 10 });
    expect(adj.status).toBe(403);
    expect(adj.body.code).toBe('SELF_WALLET_ADJUST_FORBIDDEN');
    const funds = await api('post', `/api/finances/accounts/${ids.manager}/add-funds`, 'manager').send({ amount: 10 });
    expect(funds.status).toBe(403);
    expect(funds.body.code).toBe('SELF_WALLET_ADJUST_FORBIDDEN');
  });

  test('a manager can still credit someone else', async () => {
    const res = await api('post', '/api/wallet/manual-adjust', 'manager').send({ userId: ids.student, amount: 10, description: 'test' });
    expect(res.status).toBe(201);
  });
});
