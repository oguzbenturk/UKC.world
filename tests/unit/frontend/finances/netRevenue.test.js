import { describe, it, expect, beforeEach } from 'vitest';
import { buildNetData } from '@/features/finances/utils/netRevenue';

describe('netRevenue', () => {
  describe('buildNetData', () => {
    let mockSummary, mockLedger, mockSettings;

    beforeEach(() => {
      mockSummary = {
        revenue: {
          total_revenue: 10000,
          total_refunds: 500,
          total_transactions: 20,
        },
        netRevenue: null,
      };
      mockLedger = {
        commissionTotal: 1000,
        commissionRate: 0.1,
        expectedTotal: 10000,
      };
      mockSettings = {
        tax_rate_pct: 5,
        insurance_rate_pct: 2,
        equipment_rate_pct: 1,
        payment_method_fees: { card: { pct: 2, fixed: 0.5 } },
      };
    });

    it('builds net data from ledger when no snapshot exists', () => {
      const result = buildNetData(mockSummary, mockLedger, mockSettings);
      expect(result.gross).toBe(10000);
      expect(result.commission).toBe(1000);
      expect(result.net).toBeDefined();
      expect(result.supported).toBe(false);
    });

    it('uses ledger expected total for gross revenue', () => {
      const result = buildNetData(mockSummary, mockLedger, mockSettings);
      expect(result.gross).toBe(10000);
    });

    it('subtracts refunds from base calculation', () => {
      const result = buildNetData(mockSummary, mockLedger, mockSettings);
      // Net should account for refunds: gross - commission - refunds
      expect(result.net).toBeLessThan(10000);
    });

    it('falls back to total_revenue when expectedTotal is 0', () => {
      mockLedger.expectedTotal = 0;
      const result = buildNetData(mockSummary, mockLedger, mockSettings);
      expect(result.gross).toBe(10000);
    });

    it('calculates commission rate correctly', () => {
      const result = buildNetData(mockSummary, mockLedger, mockSettings);
      expect(result.commissionRate).toBe(10); // 1000/10000 * 100
    });

    it('applies tax rate from settings', () => {
      const result = buildNetData(mockSummary, mockLedger, mockSettings);
      expect(result.tax).toBe(500); // 10000 * 5%
    });

    it('applies insurance rate from settings', () => {
      const result = buildNetData(mockSummary, mockLedger, mockSettings);
      expect(result.insurance).toBe(200); // 10000 * 2%
    });

    it('applies equipment rate from settings', () => {
      const result = buildNetData(mockSummary, mockLedger, mockSettings);
      expect(result.equipment).toBe(100); // 10000 * 1%
    });

    it('handles null ledger gracefully', () => {
      const result = buildNetData(mockSummary, null, mockSettings);
      expect(result.gross).toBe(10000);
      expect(result.commission).toBe(0);
    });

    it('handles missing revenue data', () => {
      const minimalSummary = { revenue: {}, netRevenue: null };
      const result = buildNetData(minimalSummary, mockLedger, mockSettings);
      expect(result).toBeDefined();
      expect(result.net).toBeDefined();
    });

    it('uses snapshot net data when available', () => {
      mockSummary.netRevenue = {
        items_count: 5,
        gross_total: 9500,
        commission_total: 950,
        tax_total: 400,
        insurance_total: 150,
        equipment_total: 75,
        payment_fee_total: 100,
        net_total: 7825,
      };
      const result = buildNetData(mockSummary, mockLedger, mockSettings);
      expect(result.supported).toBe(true);
      expect(result.gross).toBe(10000); // Uses higher of snapshot/ledger
    });

    it('handles empty snapshot (0 items)', () => {
      mockSummary.netRevenue = {
        items_count: 0,
        gross_total: 0,
        commission_total: 0,
        net_total: 0,
      };
      const result = buildNetData(mockSummary, mockLedger, mockSettings);
      expect(result.gross).toBe(10000); // Falls back to ledger
    });

    it('preserves commission from snapshot when greater than ledger', () => {
      mockSummary.netRevenue = {
        items_count: 5,
        gross_total: 10000,
        commission_total: 1500,
        tax_total: 0,
        insurance_total: 0,
        equipment_total: 0,
        payment_fee_total: 0,
        net_total: 8500,
      };
      const result = buildNetData(mockSummary, mockLedger, mockSettings);
      expect(result.commission).toBe(1500);
    });

    it('handles null netRevenue in summary', () => {
      const summary = {
        revenue: mockSummary.revenue,
        netRevenue: null,
      };
      const result = buildNetData(summary, mockLedger, mockSettings);
      expect(result.supported).toBe(false);
      expect(result.gross).toBe(10000);
    });

    it('calculates net with deductions from settings', () => {
      const result = buildNetData(mockSummary, mockLedger, mockSettings);
      // Net should subtract commission and refunds at minimum
      expect(result.net).toBeLessThan(10000);
      expect(result.net).toBeGreaterThan(0);
    });

    it('handles ledger rate fallback when commission is zero', () => {
      mockLedger.commissionTotal = 0;
      mockLedger.commissionRate = 0.1;
      mockSummary.revenue.total_revenue = 5000;
      const result = buildNetData(mockSummary, mockLedger, mockSettings);
      // Should use ledger rate as fallback when commission is 0
      expect(result.commissionRate).toBe(10); // ledgerRate * 100
    });
  });
});
