import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

/**
 * recomputeBookingDiscountsForPriceEdit — rebase base for package-funded bookings.
 *
 * Regression for Maria Mordovira (2026-09-09): a 1.5h lesson funded 1h package +
 * 0.5h cash (€47.50 gross, €12.50 custom-total discount = 26.32%) was checked
 * out at 2h. The reconcile re-priced the cash leg to 1h × €95 = €95, and the
 * rebase then computed 26.32% of the WHOLE lesson value (package hour €66.67 +
 * cash €95 = €161.67) = €42.55 — a discount the customer never had. The percent
 * was derived from the cash leg at apply time, so the rebase must use the cash
 * leg too: 26.32% × €95 = €25.00.
 */

let recomputeBookingDiscountsForPriceEdit;
let recordTransactionMock;
let computeLessonAmountMock;

const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';

function makeClient({ discountRows, bookingRow, walletNet, openCredit }) {
  const calls = [];
  const query = jest.fn(async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM discounts WHERE entity_type = 'booking'/.test(sql)) return { rows: discountRows };
    if (/FROM bookings\s+WHERE id = \$1/.test(sql)) return { rows: [bookingRow] };
    if (/transaction_type = ANY\(\$3\)/.test(sql)) return { rows: [{ net: walletNet }] };
    if (/t\.discount_id = \$1/.test(sql)) return { rows: openCredit ? [openCredit] : [] };
    if (/FROM booking_participants/.test(sql)) return { rows: [] };
    return { rows: [], rowCount: 0 };
  });
  return { query, calls };
}

beforeAll(async () => {
  recordTransactionMock = jest.fn(async () => ({ id: 'tx-new' }));
  computeLessonAmountMock = jest.fn(async () => 161.67);

  await jest.unstable_mockModule('../../../../backend/db.js', () => ({
    pool: { query: jest.fn(async () => ({ rows: [] })) },
    default: { query: jest.fn(async () => ({ rows: [] })) },
  }));
  await jest.unstable_mockModule('../../../../backend/middlewares/errorHandler.js', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  }));
  await jest.unstable_mockModule('../../../../backend/services/walletService.js', () => ({
    recordTransaction: recordTransactionMock,
  }));
  await jest.unstable_mockModule('../../../../backend/services/bookingUpdateCascadeService.js', () => ({
    default: {
      computeLessonAmount: computeLessonAmountMock,
      recomputeEarningsForPackage: jest.fn(),
      cascadeBookingUpdate: jest.fn(),
    },
  }));
  await jest.unstable_mockModule('../../../../backend/services/managerCommissionService.js', () => ({
    recomputeManagerCommissionsForPackage: jest.fn(),
    recomputeManagerCommissionForEntity: jest.fn(),
  }));

  const mod = await import('../../../../backend/services/discountService.js');
  recomputeBookingDiscountsForPriceEdit = mod.recomputeBookingDiscountsForPriceEdit;
});

beforeEach(() => {
  recordTransactionMock.mockClear();
  computeLessonAmountMock.mockClear();
});

const discountRow = {
  id: 708,
  customer_id: STUDENT_ID,
  percent: '26.32',
  amount: '12.50',
  currency: 'EUR',
  reason: 'Custom total set at booking creation',
  participant_user_id: null,
};

const openCredit = {
  id: 'tx-old-credit',
  user_id: STUDENT_ID,
  amount: '12.5000',
  currency: 'EUR',
  discount_id: 708,
  related_entity_type: 'booking',
  related_entity_id: BOOKING_ID,
  booking_id: BOOKING_ID,
  rental_id: null,
  metadata: { discount_id: 708, entity_type: 'booking', entity_id: BOOKING_ID },
};

describe('recomputeBookingDiscountsForPriceEdit — partial (package + cash) booking', () => {
  test('rebases a partial booking against its CASH LEG, not the whole lesson value', async () => {
    const booking = {
      id: BOOKING_ID,
      student_user_id: STUDENT_ID,
      customer_package_id: 'a36422a7-9b38-4fca-9433-4fc2acd8725d',
      payment_status: 'partial',
      duration: 2,
      amount: 95,
      final_amount: 95,
      currency: 'EUR',
    };
    const client = makeClient({
      discountRows: [discountRow],
      bookingRow: { original_price: 95, currency: 'EUR', customer_id: STUDENT_ID, is_paid: false },
      walletNet: '-47.5',
      openCredit,
    });

    const res = await recomputeBookingDiscountsForPriceEdit(client, { booking, createdBy: null });

    expect(res).toEqual({ rebased: 1 });
    // The lesson-value derivation (package hours + cash) must NOT drive a partial rebase.
    expect(computeLessonAmountMock).not.toHaveBeenCalled();

    const upd = client.calls.find((c) => /UPDATE discounts SET amount/.test(c.sql));
    expect(upd).toBeDefined();
    expect(upd.params[0]).toBe(25);   // 26.32% × €95 cash leg
    expect(upd.params[1]).toBe(708);

    // Old €12.50 credit reversed, fresh €25 credit posted — net wallet effect +€12.50.
    const posted = recordTransactionMock.mock.calls.map((c) => c[0]);
    const reversal = posted.find((p) => p.transactionType === 'discount_adjustment_reversal');
    const credit = posted.find((p) => p.transactionType === 'discount_adjustment');
    expect(reversal).toMatchObject({ amount: 12.5, availableDelta: -12.5, userId: STUDENT_ID });
    expect(credit).toMatchObject({ amount: 25, availableDelta: 25, userId: STUDENT_ID, bookingId: BOOKING_ID });
  });

  test('a fully package-funded booking still rebases against the package-derived lesson value', async () => {
    const booking = {
      id: BOOKING_ID,
      student_user_id: STUDENT_ID,
      customer_package_id: 'a36422a7-9b38-4fca-9433-4fc2acd8725d',
      payment_status: 'package',
      duration: 2,
      amount: 0,
      final_amount: 0,
      currency: 'EUR',
    };
    computeLessonAmountMock.mockResolvedValueOnce(133.33);
    const client = makeClient({
      discountRows: [{ ...discountRow, percent: '50', amount: '33.33' }],
      bookingRow: { original_price: 0, currency: 'EUR', customer_id: STUDENT_ID, is_paid: false },
      walletNet: '0',
      openCredit: null,
    });

    const res = await recomputeBookingDiscountsForPriceEdit(client, { booking, createdBy: null });

    expect(res).toEqual({ rebased: 1 });
    expect(computeLessonAmountMock).toHaveBeenCalledTimes(1);
    const upd = client.calls.find((c) => /UPDATE discounts SET amount/.test(c.sql));
    expect(upd.params[0]).toBe(66.67); // 50% × €133.33
    // Unpaid (no wallet charge) → no phantom credit.
    expect(recordTransactionMock).not.toHaveBeenCalled();
  });

  test('is a no-op when the rebased amount does not change', async () => {
    const booking = {
      id: BOOKING_ID,
      student_user_id: STUDENT_ID,
      customer_package_id: 'a36422a7-9b38-4fca-9433-4fc2acd8725d',
      payment_status: 'partial',
      duration: 1.5,
      amount: 47.5,
      final_amount: 47.5,
      currency: 'EUR',
    };
    const client = makeClient({
      discountRows: [discountRow],
      bookingRow: { original_price: 47.5, currency: 'EUR', customer_id: STUDENT_ID, is_paid: false },
      walletNet: '-47.5',
      openCredit,
    });

    const res = await recomputeBookingDiscountsForPriceEdit(client, { booking, createdBy: null });
    expect(res).toEqual({ rebased: 0 });
    expect(recordTransactionMock).not.toHaveBeenCalled();
    expect(client.calls.some((c) => /UPDATE discounts SET amount/.test(c.sql))).toBe(false);
  });
});
