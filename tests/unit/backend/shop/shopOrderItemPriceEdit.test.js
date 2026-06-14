import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

// Mock the three downstream services so we test ONLY this service's
// orchestration + money math in isolation. Paths are resolved from this test
// file (tests/unit/backend/shop/ -> 4 levels up to repo root).
let updateShopOrderItemPrice;
let convertCurrencyMock;
let recomputeCommissionMock;
let recordTransactionMock;

beforeAll(async () => {
  convertCurrencyMock = jest.fn(async (amount, from, to) => {
    if (from === to) return Number(amount);
    // deterministic stand-in rate: 1 TRY = 0.04 (order) units
    return Number((Number(amount) * 0.04).toFixed(2));
  });
  recomputeCommissionMock = jest.fn(async () => ({ updated: true }));
  recordTransactionMock = jest.fn(async () => ({ id: 'wtx-1' }));

  await jest.unstable_mockModule('../../../../backend/services/currencyService.js', () => ({
    default: { convertCurrency: convertCurrencyMock },
  }));
  await jest.unstable_mockModule('../../../../backend/services/walletService.js', () => ({
    recordTransaction: recordTransactionMock,
  }));
  await jest.unstable_mockModule('../../../../backend/services/managerCommissionService.js', () => ({
    recomputeManagerCommissionForEntity: recomputeCommissionMock,
  }));
  await jest.unstable_mockModule('../../../../backend/services/discountService.js', () => ({
    // real-equivalent pure helper: percent of base, 2dp
    computeDiscountAmount: (orig, pct) => Math.round(((Number(orig) || 0) * (Number(pct) || 0)) / 100 * 100) / 100,
  }));
  await jest.unstable_mockModule('../../../../backend/middlewares/errorHandler.js', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  ({ updateShopOrderItemPrice } = await import('../../../../backend/services/shopOrderPriceService.js'));
});

// Builds a mock pg client that answers by SQL shape and records every call so
// the test can assert what was written. `otherItemsSum` = total_price of the
// OTHER line items on the order (the edited item's new total is added live).
function makeClient({ order, item, otherItemsSum = 0, discountRow = null }) {
  const calls = [];
  let lastItemTotal = Number(item.total_price) || 0;
  const client = {
    query: jest.fn(async (sql, params = []) => {
      calls.push({ sql, params });
      const s = String(sql);
      if (/FROM shop_orders\s+WHERE id = \$1\s+FOR UPDATE/.test(s)) return { rows: [order] };
      if (/FROM shop_order_items\s+WHERE id = \$1 AND order_id/.test(s)) return { rows: [item] };
      if (/UPDATE shop_order_items\s+SET/.test(s)) { lastItemTotal = Number(params[1]); return { rowCount: 1 }; }
      if (/SUM\(total_price\)/.test(s)) return { rows: [{ subtotal: otherItemsSum + lastItemTotal }] };
      if (/UPDATE shop_orders\s+SET/.test(s)) return { rowCount: 1 };
      if (/FROM discounts/.test(s)) return { rows: discountRow ? [discountRow] : [] };
      if (/UPDATE discounts\s+SET amount/.test(s)) return { rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }),
  };
  return { client, calls };
}

const baseOrder = {
  id: 7, user_id: 'cust-1', order_number: 'ORD-7', currency: 'EUR',
  subtotal: 100, discount_amount: 0, total_amount: 100,
  status: 'confirmed', payment_status: 'completed', admin_notes: null,
};
const baseItem = {
  id: 3, order_id: 7, product_name: 'Kite Bar', quantity: 2,
  unit_price: 0, total_price: 0, original_unit_price: null, currency: 'EUR',
};

describe('updateShopOrderItemPrice', () => {
  beforeEach(() => {
    convertCurrencyMock.mockClear();
    recomputeCommissionMock.mockClear();
    recordTransactionMock.mockClear();
  });

  test('sets unit/total and re-derives order subtotal+total (same currency)', async () => {
    // one OTHER item worth 100 already on the order
    const { client, calls } = makeClient({ order: { ...baseOrder, subtotal: 100, total_amount: 100 }, item: { ...baseItem }, otherItemsSum: 100 });
    const res = await updateShopOrderItemPrice({
      client, orderId: 7, itemId: 3, newUnitPrice: 25, reason: 'price agreed after sale', actorId: 'admin-1',
    });

    expect(res.newUnitPrice).toBe(25);
    expect(res.itemTotal).toBe(50);            // 25 * qty(2)
    expect(res.subtotal).toBe(150);            // 100 other + 50
    expect(res.totalAmount).toBe(150);         // no voucher discount
    expect(res.delta).toBe(50);                // was 0

    const itemUpdate = calls.find(c => /UPDATE shop_order_items/.test(c.sql));
    expect(itemUpdate.params[0]).toBe(25);     // unit_price
    expect(itemUpdate.params[1]).toBe(50);     // total_price
    expect(itemUpdate.params[2]).toBe(0);      // original_unit_price preserved = old unit (0)
    expect(convertCurrencyMock).not.toHaveBeenCalled();
    expect(recomputeCommissionMock).toHaveBeenCalledWith(client, 'shop_order', 7);
  });

  test('preserves a voucher discount when re-deriving total_amount', async () => {
    const { client } = makeClient({ order: { ...baseOrder, discount_amount: 10 }, item: { ...baseItem }, otherItemsSum: 100 });
    const res = await updateShopOrderItemPrice({
      client, orderId: 7, itemId: 3, newUnitPrice: 25, reason: 'x',
    });
    expect(res.subtotal).toBe(150);
    expect(res.totalAmount).toBe(140);         // 150 - 10 voucher
  });

  test('converts a price entered in another currency to the order currency', async () => {
    const { client, calls } = makeClient({ order: { ...baseOrder }, item: { ...baseItem }, otherItemsSum: 0 });
    const res = await updateShopOrderItemPrice({
      client, orderId: 7, itemId: 3, newUnitPrice: 1000, reason: 'entered in TRY', inputCurrency: 'TRY',
    });
    expect(convertCurrencyMock).toHaveBeenCalledWith(1000, 'TRY', 'EUR');
    expect(res.newUnitPrice).toBe(40);         // 1000 * 0.04
    expect(res.itemTotal).toBe(80);            // 40 * 2
    expect(res.conversion).toMatchObject({ from: 'TRY', to: 'EUR', convertedAmount: 40 });
    const itemUpdate = calls.find(c => /UPDATE shop_order_items/.test(c.sql));
    expect(itemUpdate.params[3]).toBe('EUR');  // stored in order currency
  });

  test('keeps the FIRST original_unit_price across repeat edits', async () => {
    const { client, calls } = makeClient({
      order: { ...baseOrder }, item: { ...baseItem, unit_price: 30, total_price: 60, original_unit_price: 20 }, otherItemsSum: 0,
    });
    await updateShopOrderItemPrice({ client, orderId: 7, itemId: 3, newUnitPrice: 45, reason: 'second edit' });
    const itemUpdate = calls.find(c => /UPDATE shop_order_items/.test(c.sql));
    expect(itemUpdate.params[2]).toBe(20);     // original stays 20, not 30
  });

  test('rebases a percent discount against the new total', async () => {
    const { client, calls } = makeClient({
      order: { ...baseOrder }, item: { ...baseItem }, otherItemsSum: 100,
      discountRow: { id: 'd1', percent: 10, amount: 10 },     // was 10% of 100
    });
    const res = await updateShopOrderItemPrice({ client, orderId: 7, itemId: 3, newUnitPrice: 25, reason: 'x' });
    // new total 150 -> 10% = 15
    expect(res.discount).toMatchObject({ id: 'd1', percent: 10, oldAmount: 10, newAmount: 15 });
    const discUpdate = calls.find(c => /UPDATE discounts\s+SET amount/.test(c.sql));
    expect(discUpdate.params[0]).toBe(15);
  });

  test('charges the customer (wallet debit) when the price goes up', async () => {
    // item 0 -> 25 (qty 2) = +50 line delta
    const { client } = makeClient({ order: { ...baseOrder }, item: { ...baseItem }, otherItemsSum: 0 });
    const res = await updateShopOrderItemPrice({ client, orderId: 7, itemId: 3, newUnitPrice: 25, reason: 'set after sale' });
    expect(recordTransactionMock).toHaveBeenCalledTimes(1);
    const tx = recordTransactionMock.mock.calls[0][0];
    expect(tx).toMatchObject({
      userId: 'cust-1', amount: -50, availableDelta: -50, currency: 'EUR',
      transactionType: 'payment', direction: 'debit', relatedEntityType: 'shop_order', allowNegative: true,
    });
    expect(tx.metadata).toMatchObject({ orderId: 7, itemId: 3, kind: 'item_price_adjustment' });
    expect(res.walletAdjustment).toMatchObject({ direction: 'debit', amount: 50, currency: 'EUR' });
  });

  test('refunds the customer (wallet credit) when the price goes down', async () => {
    // item 30/u (60 line) -> 10/u (20 line) = -40 line delta
    const { client } = makeClient({
      order: { ...baseOrder }, item: { ...baseItem, unit_price: 30, total_price: 60 }, otherItemsSum: 0,
    });
    await updateShopOrderItemPrice({ client, orderId: 7, itemId: 3, newUnitPrice: 10, reason: 'overcharge fix' });
    const tx = recordTransactionMock.mock.calls[0][0];
    expect(tx).toMatchObject({
      amount: 40, availableDelta: 40, transactionType: 'refund', direction: 'credit',
      relatedEntityType: 'shop_order_refund',
    });
  });

  test('does NOT touch the wallet when settleWallet is false (records-only)', async () => {
    const { client } = makeClient({ order: { ...baseOrder }, item: { ...baseItem }, otherItemsSum: 0 });
    const res = await updateShopOrderItemPrice({ client, orderId: 7, itemId: 3, newUnitPrice: 25, reason: 'x', settleWallet: false });
    expect(recordTransactionMock).not.toHaveBeenCalled();
    expect(res.walletAdjustment).toBeNull();
  });

  test('does NOT post a wallet tx when the price is unchanged (zero delta)', async () => {
    const { client } = makeClient({
      order: { ...baseOrder }, item: { ...baseItem, unit_price: 25, total_price: 50 }, otherItemsSum: 0,
    });
    await updateShopOrderItemPrice({ client, orderId: 7, itemId: 3, newUnitPrice: 25, reason: 'no change' });
    expect(recordTransactionMock).not.toHaveBeenCalled();
  });

  test('allows an empty / omitted reason (reason is optional)', async () => {
    const { client } = makeClient({ order: { ...baseOrder }, item: { ...baseItem }, otherItemsSum: 0 });
    const res = await updateShopOrderItemPrice({ client, orderId: 7, itemId: 3, newUnitPrice: 10, reason: '   ' });
    expect(res.newUnitPrice).toBe(10);
    const res2 = await updateShopOrderItemPrice({ client, orderId: 7, itemId: 3, newUnitPrice: 12 });
    expect(res2.newUnitPrice).toBe(12);
  });

  test('rejects a reason over 500 characters', async () => {
    const { client } = makeClient({ order: { ...baseOrder }, item: { ...baseItem } });
    await expect(updateShopOrderItemPrice({ client, orderId: 7, itemId: 3, newUnitPrice: 10, reason: 'x'.repeat(501) }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('rejects a price that would overflow DECIMAL(10,2)', async () => {
    const { client } = makeClient({ order: { ...baseOrder }, item: { ...baseItem }, otherItemsSum: 0 });
    await expect(updateShopOrderItemPrice({ client, orderId: 7, itemId: 3, newUnitPrice: 100000000, reason: 'x' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('rejects a negative price', async () => {
    const { client } = makeClient({ order: { ...baseOrder }, item: { ...baseItem } });
    await expect(updateShopOrderItemPrice({ client, orderId: 7, itemId: 3, newUnitPrice: -5, reason: 'x' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('404 when the order is missing', async () => {
    const client = { query: jest.fn(async () => ({ rows: [] })) };
    await expect(updateShopOrderItemPrice({ client, orderId: 999, itemId: 3, newUnitPrice: 10, reason: 'x' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
