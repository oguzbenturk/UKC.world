import { describe, it, expect } from 'vitest';
import {
  normalizeManualAdjustments as normalizeWalletAdjustments,
  computeTotals,
} from '../../../../src/features/customers/components/customerBill/billAggregator.js';

// Regression tests for the wallet-adjustment classification that keeps the
// bill's Balance Due reconciled with the customer's wallet balance
// (Zeynep Karahan incident, 2026-07-16: a deleted membership's refund credit
// was double-counted, and orphaned discount credits had to stay invisible).

const tx = (overrides) => ({
  id: Math.random().toString(36).slice(2),
  status: 'completed',
  currency: 'EUR',
  created_at: '2026-07-01T10:00:00Z',
  ...overrides,
});

describe('normalizeWalletAdjustments', () => {
  it('surfaces a standalone manual charge as a positive Adjustments line', () => {
    const items = normalizeWalletAdjustments([
      tx({ type: 'charge', direction: 'debit', amount: -40, relatedEntityType: 'manual', description: 'Manual charge - Rescue' }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].category).toBe('adjustments');
    expect(items[0].amount).toBe(40);
    expect(items[0].status).toBe('charge');
  });

  it('surfaces a standalone staff refund as a negative Adjustments line', () => {
    const items = normalizeWalletAdjustments([
      tx({ type: 'refund', direction: 'credit', amount: 25, relatedEntityType: 'manual' }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe(-25);
    expect(items[0].status).toBe('credit');
  });

  it('does NOT surface refunds of sellable entities (member_purchase_refund, shop_order_refund)', () => {
    // The entity's own line item already tells the money story (cancelled or
    // deleted); emitting the refund credit too subtracted it a second time.
    const items = normalizeWalletAdjustments([
      tx({ type: 'refund', direction: 'credit', amount: 12, relatedEntityType: 'member_purchase_refund' }),
      tx({ type: 'refund', direction: 'credit', amount: 432, relatedEntityType: 'shop_order_refund' }),
    ]);
    expect(items).toHaveLength(0);
  });

  it('never surfaces discount adjustments or reversals', () => {
    const items = normalizeWalletAdjustments([
      tx({ type: 'discount_adjustment', direction: 'credit', amount: 48, relatedEntityType: 'shop_order' }),
      tx({ type: 'discount_adjustment_reversal', direction: 'debit', amount: -48, relatedEntityType: 'shop_order' }),
    ]);
    expect(items).toHaveLength(0);
  });

  it('skips cancelled transactions', () => {
    const items = normalizeWalletAdjustments([
      tx({ type: 'charge', direction: 'debit', amount: -78, relatedEntityType: 'manual', status: 'cancelled' }),
    ]);
    expect(items).toHaveLength(0);
  });
});

describe('computeTotals — deleted-membership refund no longer double-counts', () => {
  it('nets a wallet-funded, hard-deleted membership to zero', () => {
    // Wallet story: -12 payment (debit), +12 refund credit → net 0.
    // Bill story: the purchase row is deleted so no line item exists; the
    // refund credit must not reappear anywhere.
    const transactions = [
      tx({ type: 'payment', direction: 'debit', amount: -12, relatedEntityType: 'member_purchase' }),
      tx({ type: 'refund', direction: 'credit', amount: 12, relatedEntityType: 'member_purchase_refund' }),
    ];
    const lineItems = normalizeWalletAdjustments(transactions); // nothing standalone
    const totals = computeTotals(lineItems, transactions, null, 'EUR', null);
    expect(totals.subtotal).toBe(0);
    expect(totals.paymentsReceived).toBe(0);
    expect(totals.balanceDue).toBe(0);
  });

  it('keeps deposits in paymentsReceived and manual charges in the subtotal', () => {
    const transactions = [
      tx({ type: 'wallet_deposit', direction: 'credit', amount: 100 }),
      tx({ type: 'charge', direction: 'debit', amount: -40, relatedEntityType: 'manual' }),
      tx({ type: 'discount_adjustment', direction: 'credit', amount: 48, relatedEntityType: 'shop_order' }),
    ];
    const lineItems = normalizeWalletAdjustments(transactions);
    const totals = computeTotals(lineItems, transactions, null, 'EUR', null);
    // Manual charge is a line item; discount credit is invisible; deposit is a payment.
    expect(totals.subtotal).toBe(40);
    expect(totals.paymentsReceived).toBe(100);
    expect(totals.balanceDue).toBe(-60);
  });
});
