import { describe, it, expect } from 'vitest';
import { roundHours, computeChargeableHours, computeBookingPrice, getPricingBreakdown } from '../pricing';

describe('pricing utils', () => {
  it('roundHours rounds to nearest quarter hour', () => {
    expect(roundHours(1.12, 0.25)).toBe(1.0);
    expect(roundHours(1.13, 0.25)).toBe(1.25);
    expect(roundHours(1.37, 0.25)).toBe(1.25);
    expect(roundHours(1.38, 0.25)).toBe(1.5);
  });

  it('computes chargeable hours with package deduction', () => {
    expect(computeChargeableHours(2.5, 0.5, 0.25)).toBe(2.0);
    expect(computeChargeableHours(1, 2, 0.25)).toBe(0);
    expect(computeChargeableHours(1.75, 0.2, 0.25)).toBe(1.5);
  });

  it('computes final booking price (acceptance scenario)', () => {
    // Planned 2.5h, 0.5h from package, pay for 2h at rate
    const total = computeBookingPrice({ plannedHours: 2.5, hourlyRate: 100, packageHoursAvailable: 0.5, step: 0.25 });
    expect(total).toBe(200);
  });

  it('provides a pricing breakdown', () => {
    const breakdown = getPricingBreakdown({ plannedHours: 1.75, hourlyRate: 80, packageHoursAvailable: 0.25, step: 0.25, participants: 2 });
    expect(breakdown.chargeableHours).toBe(1.5);
    expect(breakdown.total).toBe(240); // 1.5 * 80 * 2
  });
});
