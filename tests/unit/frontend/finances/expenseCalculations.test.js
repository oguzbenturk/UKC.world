import { describe, it, expect } from 'vitest';
import {
  resolvePaymentFeeEntry,
  ensureExpensesFromSettings,
  sumExpenses,
  numberOrZero,
} from '@/features/finances/utils/expenseCalculations';

describe('expenseCalculations', () => {
  describe('numberOrZero', () => {
    it('returns number when valid', () => {
      expect(numberOrZero(100)).toBe(100);
      expect(numberOrZero(0)).toBe(0);
      expect(numberOrZero(-50)).toBe(-50);
    });

    it('returns 0 for non-numeric values', () => {
      expect(numberOrZero('abc')).toBe(0);
      expect(numberOrZero(null)).toBe(0);
      expect(numberOrZero(undefined)).toBe(0);
      expect(numberOrZero(NaN)).toBe(0);
    });

    it('converts string numbers to numbers', () => {
      expect(numberOrZero('100')).toBe(100);
      expect(numberOrZero('25.5')).toBe(25.5);
    });

    it('returns 0 for Infinity', () => {
      expect(numberOrZero(Infinity)).toBe(0);
      expect(numberOrZero(-Infinity)).toBe(0);
    });
  });

  describe('resolvePaymentFeeEntry', () => {
    it('returns zero fee for empty object', () => {
      const result = resolvePaymentFeeEntry({});
      expect(result).toEqual({ pct: 0, fixed: 0 });
    });

    it('returns zero fee for null', () => {
      const result = resolvePaymentFeeEntry(null);
      expect(result).toEqual({ pct: 0, fixed: 0 });
    });

    it('prioritizes card payment method', () => {
      const fees = {
        online: { pct: 2, fixed: 0.5 },
        card: { pct: 2.5, fixed: 0.3 },
        default: { pct: 1, fixed: 0.1 },
      };
      const result = resolvePaymentFeeEntry(fees);
      expect(result).toEqual({ pct: 2.5, fixed: 0.3 });
    });

    it('falls back to alternative payment methods', () => {
      const fees = {
        terminal: { pct: 3, fixed: 0.5 },
      };
      const result = resolvePaymentFeeEntry(fees);
      expect(result).toEqual({ pct: 3, fixed: 0.5 });
    });

    it('ignores disabled payment methods', () => {
      const fees = {
        card: { pct: 2.5, fixed: 0.3, active: false },
        iyzico: { pct: 2, fixed: 0.4 },
      };
      const result = resolvePaymentFeeEntry(fees);
      expect(result).toEqual({ pct: 2, fixed: 0.4 });
    });

    it('extracts percentage with multiple key names', () => {
      const fees = {
        card: { percentage: 2.5, flat: 0.3 },
      };
      const result = resolvePaymentFeeEntry(fees);
      expect(result).toEqual({ pct: 2.5, fixed: 0.3 });
    });

    it('handles rate and pct field names', () => {
      const fees = {
        card: { rate: 1.5, fixed: 0.2 },
      };
      const result = resolvePaymentFeeEntry(fees);
      expect(result).toEqual({ pct: 1.5, fixed: 0.2 });
    });

    it('uses first valid entry when preference not found', () => {
      const fees = {
        custom_method: { pct: 3.5, fixed: 0.5 },
      };
      const result = resolvePaymentFeeEntry(fees);
      expect(result).toEqual({ pct: 3.5, fixed: 0.5 });
    });
  });

  describe('ensureExpensesFromSettings', () => {
    it('returns null when netData is null', () => {
      const result = ensureExpensesFromSettings(null, {});
      expect(result).toBeNull();
    });

    it('returns copy of netData when settings object is empty', () => {
      const netData = { gross: 1000, net: 900, commission: 100 };
      const result = ensureExpensesFromSettings(netData, {});
      expect(result).toEqual(netData);
    });

    it('applies tax rate from settings', () => {
      const netData = { gross: 1000, net: 900, tax: 0 };
      const settings = { tax_rate_pct: 10 };
      const result = ensureExpensesFromSettings(netData, { financialSettings: settings });
      expect(result.tax).toBe(100); // 1000 * 10%
    });

    it('preserves existing tax values', () => {
      const netData = { gross: 1000, net: 900, tax: 50 };
      const settings = { tax_rate_pct: 10 };
      const result = ensureExpensesFromSettings(netData, { financialSettings: settings });
      expect(result.tax).toBe(50); // existing value preserved
    });

    it('applies insurance rate from settings', () => {
      const netData = { gross: 1000, net: 900, insurance: 0 };
      const settings = { insurance_rate_pct: 5 };
      const result = ensureExpensesFromSettings(netData, { financialSettings: settings });
      expect(result.insurance).toBe(50); // 1000 * 5%
    });

    it('applies equipment rate from settings', () => {
      const netData = { gross: 1000, net: 900, equipment: 0 };
      const settings = { equipment_rate_pct: 3 };
      const result = ensureExpensesFromSettings(netData, { financialSettings: settings });
      expect(result.equipment).toBe(30); // 1000 * 3%
    });

    it('calculates payment fee from percentage', () => {
      const netData = { gross: 1000, net: 900, paymentFee: 0 };
      const revenueTotals = { total_transactions: 10 };
      const settings = {
        payment_method_fees: { card: { pct: 2, fixed: 0.5 } },
      };
      const result = ensureExpensesFromSettings(netData, {
        financialSettings: settings,
        revenueTotals,
      });
      expect(result.paymentFee).toBe(25); // 1000 * 2% + 10 * 0.5
    });

    it('recalculates net after adding expenses', () => {
      const netData = {
        gross: 1000,
        net: 900,
        commission: 50,
        tax: 0,
        insurance: 0,
        equipment: 0,
        paymentFee: 0,
      };
      const settings = { tax_rate_pct: 5, insurance_rate_pct: 2 };
      const result = ensureExpensesFromSettings(netData, { financialSettings: settings });
      expect(result.net).toBe(1000 - 50 - 50 - 20); // gross - commission - tax - insurance
    });

    it('calculates commission rate when not already set', () => {
      const netData = {
        gross: 1000,
        net: 900,
        commission: 100,
      };
      const result = ensureExpensesFromSettings(netData, { financialSettings: {} });
      expect(result.commissionRate).toBe(10); // 100/1000 * 100
    });

    it('handles zero gross revenue gracefully', () => {
      const netData = { gross: 0, net: 0, tax: 0 };
      const settings = { tax_rate_pct: 10 };
      const result = ensureExpensesFromSettings(netData, { financialSettings: settings });
      expect(result.gross).toBe(0);
      expect(result.tax).toBe(0);
    });

    it('uses higher of gross values when multiple sources exist', () => {
      const netData = { gross: 500, net: 400 };
      const revenueTotals = { total_revenue: 1000 };
      const result = ensureExpensesFromSettings(netData, {
        financialSettings: {},
        revenueTotals,
      });
      expect(result.gross).toBe(1000); // uses higher value
    });

    it('subtracts refunds from net', () => {
      const netData = { gross: 1000, net: 1000, commission: 0, tax: 0, insurance: 0, equipment: 0, paymentFee: 0 };
      const result = ensureExpensesFromSettings(netData, {
        financialSettings: {},
        refundTotal: 200,
      });
      expect(result.net).toBe(800); // 1000 - 200
    });
  });

  describe('sumExpenses', () => {
    it('sums all expense types', () => {
      const netData = {
        commission: 100,
        tax: 50,
        insurance: 30,
        equipment: 20,
        paymentFee: 15,
      };
      expect(sumExpenses(netData)).toBe(215);
    });

    it('returns 0 for null netData', () => {
      expect(sumExpenses(null)).toBe(0);
    });

    it('ignores missing expense fields', () => {
      const netData = {
        commission: 100,
        tax: 50,
      };
      expect(sumExpenses(netData)).toBe(150);
    });

    it('treats undefined fields as 0', () => {
      const netData = {
        commission: 100,
        tax: undefined,
        insurance: 50,
        equipment: undefined,
        paymentFee: 20,
      };
      expect(sumExpenses(netData)).toBe(170);
    });

    it('handles negative expense values', () => {
      const netData = {
        commission: 100,
        tax: -10,
        insurance: 30,
        equipment: 0,
        paymentFee: 0,
      };
      expect(sumExpenses(netData)).toBe(120);
    });

    it('handles all zero expenses', () => {
      const netData = {
        commission: 0,
        tax: 0,
        insurance: 0,
        equipment: 0,
        paymentFee: 0,
      };
      expect(sumExpenses(netData)).toBe(0);
    });
  });
});
