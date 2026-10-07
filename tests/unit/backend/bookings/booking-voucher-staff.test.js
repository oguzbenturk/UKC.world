/**
 * Regression: staff (admin) creating a booking for a customer with a voucher
 * always returned 400 VOUCHER_ERROR.
 *
 * Root cause: POST /bookings looked up the customer's role with
 * `SELECT role FROM users WHERE id = $1`, but `users` has no `role` column
 * (role lives in roles.name via users.role_id). Postgres threw
 * "column role does not exist", the voucher catch-block turned it into a 400.
 *
 * These tests drive the real POST / handler with a mocked pg client that
 * behaves like Postgres for that query (throws), and the REAL
 * voucherService.validateVoucher backed by a mocked pool, so the per-user
 * limit check is exercised against the customer's redemption count.
 */
import { jest } from '@jest/globals';
import bookingsRouter from '../../../../backend/routes/bookings.js';
import voucherService from '../../../../backend/services/voucherService.js';
import { pool } from '../../../../backend/db.js';

const originalConnect = pool.connect;
const originalPoolQuery = pool.query;

const STAFF_ID = 'admin-1';
const CUSTOMER_ID = 'student-1';
const VOUCHER_ID = '11111111-2222-4333-8444-555555555555';

const findHandler = (method, path) => {
  const layer = bookingsRouter.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  const handlers = layer.route.stack.map((l) => l.handle);
  return handlers[handlers.length - 1];
};

const voucherRow = (overrides = {}) => ({
  id: VOUCHER_ID,
  code: 'SAVE10',
  name: '10% off',
  description: null,
  voucher_type: 'percentage',
  discount_value: '10',
  max_discount: null,
  currency: null,
  is_active: true,
  valid_from: null,
  valid_until: null,
  max_total_uses: null,
  total_uses: 0,
  usage_type: 'single_per_user',
  max_uses_per_user: 1,
  visibility: 'public',
  allowed_roles: null,
  allowed_user_ids: null,
  applies_to: 'all',
  applies_to_ids: null,
  excludes_ids: null,
  requires_first_purchase: false,
  min_purchase_amount: null,
  ...overrides,
});

/**
 * @param {object} opts
 * @param {Record<string, number>} opts.redemptionsByUser  voucher_redemptions count per user id
 * @param {object} [opts.voucher]                          voucher_codes row overrides
 * @param {string} [opts.customerRole]                     roles.name for the customer
 */
function setupMocks({ redemptionsByUser = {}, voucher = {}, customerRole = 'student' } = {}) {
  const roleLookups = [];
  const insertedBookings = [];
  const row = voucherRow(voucher);

  const mockClient = {
    query: jest.fn(async (sql, params) => {
      if (typeof sql !== 'string') sql = sql?.text ?? '';
      const n = sql.trim().replace(/\s+/g, ' ');

      if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/i.test(n)) return { rows: [] };

      // Behave like Postgres: users has no `role` column.
      if (/SELECT role FROM users/i.test(n)) {
        const err = new Error('column "role" does not exist');
        err.code = '42703';
        throw err;
      }
      if (n.includes('FROM users u') && n.includes('JOIN roles r') && n.includes('AS role')) {
        roleLookups.push(params?.[0]);
        return { rows: [{ role: customerRole }] };
      }

      if (n.includes('preferred_currency') || n.includes('preferred_wallet_currency')) {
        return { rows: [{ preferred_currency: 'EUR', preferred_wallet_currency: 'EUR' }] };
      }
      if (n.includes('FROM services') && n.includes('WHERE')) {
        return {
          rows: [{
            id: 'svc-1', name: 'Kitesurf Lesson', price: '100', currency: 'EUR',
            category: 'lesson', lesson_category_tag: null, discipline_tag: null,
            level_tag: null, max_participants: null, duration: 1,
          }],
        };
      }
      if (n.includes('COUNT(*)') && n.includes('booking_count')) {
        return { rows: [{ booking_count: '0' }] };
      }
      if (n.startsWith('INSERT INTO bookings')) {
        insertedBookings.push({ sql: n, params });
        return {
          rows: [{
            id: 'bk-new-1', date: '2026-10-10', start_hour: 10, duration: 1,
            student_user_id: CUSTOMER_ID, instructor_user_id: 'instr-1',
            customer_user_id: CUSTOMER_ID, status: 'confirmed', payment_status: 'paid',
            amount: 90, final_amount: 90, group_size: 1, service_id: 'svc-1',
          }],
        };
      }
      if (n.startsWith('SELECT') && n.includes('json_agg')) {
        return { rows: [{ id: 'bk-new-1', status: 'confirmed', amount: 90, final_amount: 90, participants: [] }] };
      }
      if (n.includes('wallet_balances') && n.includes('FOR UPDATE')) {
        return { rows: [{ id: 'bal-1', available_amount: 500, pending_amount: 0, non_withdrawable_amount: 0, total_credits: 500, total_debits: 0, currency: 'EUR' }] };
      }
      if (n.includes('INSERT INTO wallet_transactions')) return { rows: [{ id: 'wtx-1' }] };
      if (n.includes('UPDATE wallet_balances')) return { rows: [{ id: 'bal-1' }] };
      return { rows: [] };
    }),
    release: jest.fn(),
  };

  pool.connect = jest.fn().mockResolvedValue(mockClient);
  // voucherService (real) reads voucher_codes / voucher_redemptions via pool.query
  pool.query = jest.fn(async (sql, params) => {
    if (typeof sql !== 'string') sql = sql?.text ?? '';
    if (sql.includes('FROM voucher_codes')) return { rows: [row] };
    if (sql.includes('FROM voucher_redemptions')) {
      return { rows: [{ count: String(redemptionsByUser[params?.[1]] ?? 0) }] };
    }
    return { rows: [] };
  });

  const validateSpy = jest.spyOn(voucherService, 'validateVoucher');
  const redeemSpy = jest.spyOn(voucherService, 'redeemVoucher').mockResolvedValue({ id: 'red-1' });

  return { mockClient, roleLookups, insertedBookings, validateSpy, redeemSpy };
}

function makeReq({ user, studentId = CUSTOMER_ID }) {
  return {
    user,
    query: {},
    body: {
      date: '2026-10-10',
      start_hour: 10,
      duration: 1,
      student_user_id: studentId,
      instructor_user_id: 'instr-1',
      service_id: 'svc-1',
      use_package: false,
      voucherId: 'SAVE10',
      payment_method: 'wallet',
    },
    socketService: { emitToChannel: jest.fn() },
  };
}

function makeRes() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('POST /bookings — voucher applied by staff on behalf of a customer', () => {
  afterEach(() => {
    pool.connect = originalConnect;
    pool.query = originalPoolQuery;
    jest.restoreAllMocks();
  });

  test('admin booking for a customer with a voucher succeeds (no 400) and validates against the CUSTOMER', async () => {
    const handler = findHandler('post', '/');
    const { roleLookups, validateSpy, redeemSpy } = setupMocks({
      // staff user has already used the voucher; the customer has not
      redemptionsByUser: { [STAFF_ID]: 1, [CUSTOMER_ID]: 0 },
    });
    const res = makeRes();

    await handler(makeReq({ user: { id: STAFF_ID, role: 'admin', email: 'a@t.com' } }), res, () => {});

    const statusCodes = res.status.mock.calls.map((c) => c[0]);
    expect(statusCodes).not.toContain(400);
    expect(statusCodes).toContain(201);

    // customer role resolved through roles join, not users.role
    expect(roleLookups).toEqual([CUSTOMER_ID]);

    expect(validateSpy).toHaveBeenCalledTimes(1);
    expect(validateSpy.mock.calls[0][0]).toMatchObject({
      code: 'SAVE10',
      userId: CUSTOMER_ID,
      userRole: 'student',
      context: 'lessons',
    });
    const validation = await validateSpy.mock.results[0].value;
    expect(validation.valid).toBe(true);

    expect(redeemSpy).toHaveBeenCalledTimes(1);
    expect(redeemSpy.mock.calls[0][0]).toMatchObject({ voucherId: VOUCHER_ID, userId: CUSTOMER_ID });
  });

  test('per-user limit is enforced against the CUSTOMER when staff books', async () => {
    const handler = findHandler('post', '/');
    const { validateSpy, redeemSpy } = setupMocks({
      redemptionsByUser: { [STAFF_ID]: 0, [CUSTOMER_ID]: 1 },
    });
    const res = makeRes();

    await handler(makeReq({ user: { id: STAFF_ID, role: 'admin', email: 'a@t.com' } }), res, () => {});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'VOUCHER_INVALID' });
    expect(validateSpy.mock.calls[0][0].userId).toBe(CUSTOMER_ID);
    const validation = await validateSpy.mock.results[0].value;
    expect(validation).toMatchObject({ valid: false, error: 'ALREADY_USED_BY_USER' });
    expect(redeemSpy).not.toHaveBeenCalled();
  });

  test('role-based voucher is checked against the customer role, not the staff role', async () => {
    const handler = findHandler('post', '/');
    const { validateSpy } = setupMocks({
      voucher: { visibility: 'role_based', allowed_roles: ['student'] },
      customerRole: 'student',
    });
    const res = makeRes();

    await handler(makeReq({ user: { id: STAFF_ID, role: 'admin', email: 'a@t.com' } }), res, () => {});

    expect(res.status).toHaveBeenCalledWith(201);
    expect(validateSpy.mock.calls[0][0].userRole).toBe('student');
  });

  test('customer booking for themselves with a voucher still works (no role lookup)', async () => {
    const handler = findHandler('post', '/');
    const { roleLookups, validateSpy, redeemSpy } = setupMocks();
    const res = makeRes();

    await handler(
      makeReq({ user: { id: CUSTOMER_ID, role: 'student', email: 's@t.com' }, studentId: CUSTOMER_ID }),
      res,
      () => {}
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(roleLookups).toEqual([]);
    expect(validateSpy.mock.calls[0][0]).toMatchObject({ userId: CUSTOMER_ID, userRole: 'student' });
    expect(redeemSpy.mock.calls[0][0]).toMatchObject({ userId: CUSTOMER_ID });
  });
});
