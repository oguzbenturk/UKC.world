/**
 * Regression: shop orders use an INTEGER (SERIAL) id, but
 * voucher_redemptions.applied_to_id is UUID. redeemVoucher passed "17" straight
 * into the UUID column → `invalid input syntax for type uuid: "17"`, the
 * INSERT failed, total_uses was never incremented and the per-user redemption
 * count stayed 0, so usage limits never applied to shop vouchers.
 *
 * Fix: non-UUID reference ids go to metadata.referenceId (applied_to_id NULL).
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

let voucherService;
let mockPool;

const VOUCHER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOOKING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

beforeAll(async () => {
  mockPool = { query: jest.fn() };

  await jest.unstable_mockModule('../../../../backend/db.js', () => ({ pool: mockPool }));
  await jest.unstable_mockModule('../../../../backend/middlewares/errorHandler.js', () => ({
    logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  }));
  await jest.unstable_mockModule('../../../../backend/services/walletService.js', () => ({
    recordTransaction: jest.fn().mockResolvedValue({ id: 'txn-1' }),
  }));

  voucherService = await import('../../../../backend/services/voucherService.js');
});

beforeEach(() => {
  mockPool.query.mockReset();
  mockPool.query.mockImplementation((sql, params) => {
    if (/INSERT INTO voucher_redemptions/.test(sql)) {
      // Emulate Postgres: applied_to_id is a UUID column
      const appliedToId = params[3];
      if (appliedToId != null && !/^[0-9a-f-]{36}$/i.test(String(appliedToId))) {
        return Promise.reject(new Error(`invalid input syntax for type uuid: "${appliedToId}"`));
      }
      return Promise.resolve({ rows: [{ id: 'r1', applied_to_id: appliedToId, metadata: JSON.parse(params[8]) }] });
    }
    return Promise.resolve({ rows: [], rowCount: 1 });
  });
});

const insertCall = () => mockPool.query.mock.calls.find(([sql]) => /INSERT INTO voucher_redemptions/.test(sql));
const usesCall = () => mockPool.query.mock.calls.find(([sql]) => /SET total_uses = total_uses \+ 1/.test(sql));

describe('redeemVoucher with integer shop order ids', () => {
  test('shop order id "17" is recorded via metadata, not the UUID column', async () => {
    const result = await voucherService.redeemVoucher({
      voucherId: VOUCHER_ID,
      userId: USER_ID,
      referenceType: 'shop',
      referenceId: '17',
      originalAmount: 100,
      discountAmount: 10,
      currency: 'EUR',
      metadata: { orderId: '17', orderNumber: 'ORD-20261007-0017' },
    });

    expect(result.id).toBe('r1');
    const [, params] = insertCall();
    expect(params[2]).toBe('shop');
    expect(params[3]).toBeNull(); // applied_to_id
    expect(JSON.parse(params[8])).toEqual({
      orderId: '17',
      orderNumber: 'ORD-20261007-0017',
      referenceId: '17',
    });
    // usage counter is bumped so max_total_uses / single_global limits apply
    expect(usesCall()[1]).toEqual([VOUCHER_ID]);
  });

  test('numeric reference ids are handled too', async () => {
    await voucherService.redeemVoucher({
      voucherId: VOUCHER_ID, userId: USER_ID, referenceType: 'shop', referenceId: 42,
      originalAmount: 50, discountAmount: 5,
    });
    const [, params] = insertCall();
    expect(params[3]).toBeNull();
    expect(JSON.parse(params[8])).toEqual({ referenceId: '42' });
    expect(usesCall()).toBeDefined();
  });

  test('UUID references (bookings/packages) still use applied_to_id', async () => {
    await voucherService.redeemVoucher({
      voucherId: VOUCHER_ID, userId: USER_ID, referenceType: 'booking', referenceId: BOOKING_ID,
      originalAmount: 80, discountAmount: 8,
    });
    const [, params] = insertCall();
    expect(params[3]).toBe(BOOKING_ID);
    expect(JSON.parse(params[8])).toEqual({});
  });

  test('null reference (wallet redemption) stores no reference', async () => {
    await voucherService.redeemVoucher({
      voucherId: VOUCHER_ID, userId: USER_ID, referenceType: 'wallet', referenceId: null,
      originalAmount: 0, discountAmount: 0, finalAmount: 0,
    });
    const [, params] = insertCall();
    expect(params[3]).toBeNull();
    expect(JSON.parse(params[8])).toEqual({});
  });
});

describe('shop voucher usage limits after a recorded redemption', () => {
  test('single_per_user voucher is rejected once the shop redemption row exists', async () => {
    mockPool.query.mockReset();
    mockPool.query.mockImplementation((sql) => {
      if (/FROM voucher_codes/i.test(sql)) {
        return Promise.resolve({
          rows: [{
            id: VOUCHER_ID, code: 'SHOP10', voucher_type: 'percentage', discount_value: 10,
            applies_to: 'shop', usage_type: 'single_per_user', max_uses_per_user: 1,
            total_uses: 1, is_active: true, visibility: 'public', currency: 'EUR',
          }],
        });
      }
      if (/COUNT\(\*\) as count FROM voucher_redemptions/i.test(sql)) {
        return Promise.resolve({ rows: [{ count: '1' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await voucherService.validateVoucher({
      code: 'SHOP10', userId: USER_ID, context: 'shop', amount: 100, currency: 'EUR',
    });
    expect(res.valid).toBe(false);
  });
});
