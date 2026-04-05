import { describe, it, expect } from 'vitest';
import {
  calculateGrowthRate,
  calculateARPC,
  calculateCLV,
  calculateProfitMargin,
  calculatePaymentEfficiency,
  calculateRefundRate,
  calculateDebtRatio,
  calculateBookingConversionRate,
  calculateAverageTransactionValue,
  calculateSeasonalIndex,
  calculateRetentionRate,
} from '@/features/finances/utils/financialCalculations';

describe('financialCalculations', () => {
  describe('calculateGrowthRate', () => {
    it('calculates positive growth rate', () => {
      expect(calculateGrowthRate(1200, 1000)).toBe(20);
    });

    it('calculates negative growth rate', () => {
      expect(calculateGrowthRate(800, 1000)).toBe(-20);
    });

    it('returns 0 when previous is 0', () => {
      expect(calculateGrowthRate(100, 0)).toBe(0);
    });

    it('returns 0 when previous is null', () => {
      expect(calculateGrowthRate(100, null)).toBe(0);
    });

    it('handles edge case of same current and previous', () => {
      expect(calculateGrowthRate(500, 500)).toBe(0);
    });
  });

  describe('calculateARPC', () => {
    it('calculates average revenue per customer correctly', () => {
      expect(calculateARPC(10000, 50)).toBe(200);
    });

    it('returns 0 when customer count is 0', () => {
      expect(calculateARPC(10000, 0)).toBe(0);
    });

    it('returns 0 when customer count is null', () => {
      expect(calculateARPC(10000, null)).toBe(0);
    });

    it('handles decimal revenue', () => {
      expect(calculateARPC(1000.50, 10)).toBe(100.05);
    });

    it('returns 0 for zero revenue and customers', () => {
      expect(calculateARPC(0, 0)).toBe(0);
    });
  });

  describe('calculateCLV', () => {
    it('calculates CLV with churn rate', () => {
      const clv = calculateCLV(500, 12, 0.05); // $500/month, 0.05 churn
      expect(clv).toBe(10000); // 500 / 0.05
    });

    it('calculates CLV with lifespan and zero churn', () => {
      const clv = calculateCLV(500, 24, 0);
      expect(clv).toBe(12000); // 500 * 24
    });

    it('returns monthlySpend * lifespan when churn is zero', () => {
      expect(calculateCLV(100, 60, 0)).toBe(6000);
    });

    it('handles churn rate greater than 0', () => {
      expect(calculateCLV(1000, 12, 0.1)).toBe(10000);
    });
  });

  describe('calculateProfitMargin', () => {
    it('calculates profit margin correctly', () => {
      expect(calculateProfitMargin(1000, 600)).toBe(40); // (1000-600)/1000 * 100
    });

    it('handles zero revenue', () => {
      expect(calculateProfitMargin(0, 100)).toBe(0);
    });

    it('returns 0 when revenue is null', () => {
      expect(calculateProfitMargin(null, 100)).toBe(0);
    });

    it('calculates negative margin when costs exceed revenue', () => {
      expect(calculateProfitMargin(1000, 1500)).toBe(-50);
    });

    it('handles decimal revenue and costs', () => {
      expect(calculateProfitMargin(1000.50, 600.25)).toBeCloseTo(40.005, 2);
    });
  });

  describe('calculatePaymentEfficiency', () => {
    it('calculates on-time payment percentage', () => {
      expect(calculatePaymentEfficiency(100, 80)).toBe(80); // 80/100 * 100
    });

    it('returns 0 when total payments is 0', () => {
      expect(calculatePaymentEfficiency(0, 50)).toBe(0);
    });

    it('returns 0 when total payments is null', () => {
      expect(calculatePaymentEfficiency(null, 50)).toBe(0);
    });

    it('handles case where on-time equals total', () => {
      expect(calculatePaymentEfficiency(100, 100)).toBe(100);
    });

    it('returns 0 for no on-time payments', () => {
      expect(calculatePaymentEfficiency(100, 0)).toBe(0);
    });
  });

  describe('calculateRefundRate', () => {
    it('calculates refund rate as percentage of revenue', () => {
      expect(calculateRefundRate(200, 5000)).toBe(4); // 200/5000 * 100
    });

    it('returns 0 when revenue is 0', () => {
      expect(calculateRefundRate(100, 0)).toBe(0);
    });

    it('returns 0 when revenue is null', () => {
      expect(calculateRefundRate(100, null)).toBe(0);
    });

    it('handles high refund rate', () => {
      expect(calculateRefundRate(2000, 5000)).toBe(40);
    });

    it('handles zero refunds', () => {
      expect(calculateRefundRate(0, 5000)).toBe(0);
    });
  });

  describe('calculateDebtRatio', () => {
    it('calculates debt to revenue ratio', () => {
      expect(calculateDebtRatio(1000, 10000)).toBe(10); // 1000/10000 * 100
    });

    it('returns 0 when revenue is 0', () => {
      expect(calculateDebtRatio(5000, 0)).toBe(0);
    });

    it('returns 0 when revenue is null', () => {
      expect(calculateDebtRatio(5000, null)).toBe(0);
    });

    it('handles high debt ratio', () => {
      expect(calculateDebtRatio(8000, 10000)).toBe(80);
    });

    it('handles zero debt', () => {
      expect(calculateDebtRatio(0, 10000)).toBe(0);
    });
  });

  describe('calculateBookingConversionRate', () => {
    it('calculates conversion rate', () => {
      expect(calculateBookingConversionRate(50, 100)).toBe(50); // 50/100 * 100
    });

    it('returns 0 when total bookings is 0', () => {
      expect(calculateBookingConversionRate(50, 0)).toBe(0);
    });

    it('returns 0 when total bookings is null', () => {
      expect(calculateBookingConversionRate(50, null)).toBe(0);
    });

    it('handles high conversion rate', () => {
      expect(calculateBookingConversionRate(95, 100)).toBe(95);
    });

    it('handles zero completed bookings', () => {
      expect(calculateBookingConversionRate(0, 100)).toBe(0);
    });
  });

  describe('calculateAverageTransactionValue', () => {
    it('calculates average transaction value', () => {
      expect(calculateAverageTransactionValue(10000, 50)).toBe(200); // 10000/50
    });

    it('returns 0 when transaction count is 0', () => {
      expect(calculateAverageTransactionValue(10000, 0)).toBe(0);
    });

    it('returns 0 when transaction count is null', () => {
      expect(calculateAverageTransactionValue(10000, null)).toBe(0);
    });

    it('handles decimal revenue', () => {
      expect(calculateAverageTransactionValue(1234.50, 25)).toBe(49.38);
    });

    it('handles zero revenue', () => {
      expect(calculateAverageTransactionValue(0, 50)).toBe(0);
    });
  });

  describe('calculateSeasonalIndex', () => {
    it('calculates seasonal index', () => {
      expect(calculateSeasonalIndex(5000, 4000)).toBe(1.25); // 5000/4000
    });

    it('returns 1 when average revenue is 0', () => {
      expect(calculateSeasonalIndex(5000, 0)).toBe(1);
    });

    it('returns 1 when average revenue is null', () => {
      expect(calculateSeasonalIndex(5000, null)).toBe(1);
    });

    it('handles below-average periods', () => {
      expect(calculateSeasonalIndex(3000, 4000)).toBe(0.75);
    });

    it('handles zero period revenue', () => {
      expect(calculateSeasonalIndex(0, 4000)).toBe(0);
    });
  });

  describe('calculateRetentionRate', () => {
    it('calculates retention rate', () => {
      expect(calculateRetentionRate(70, 100)).toBe(70); // 70/100 * 100
    });

    it('returns 0 when total customers is 0', () => {
      expect(calculateRetentionRate(70, 0)).toBe(0);
    });

    it('returns 0 when total customers is null', () => {
      expect(calculateRetentionRate(70, null)).toBe(0);
    });

    it('handles high retention rate', () => {
      expect(calculateRetentionRate(95, 100)).toBe(95);
    });

    it('handles zero returning customers', () => {
      expect(calculateRetentionRate(0, 100)).toBe(0);
    });
  });
});
