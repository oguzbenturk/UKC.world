import { splitPackageAndCash, wantsToUsePackage } from '../utils/paymentSplit.js';

describe('paymentSplit utils', () => {
  test('full package coverage -> cash 0', () => {
    const r = splitPackageAndCash({ servicePrice: 80, duration: 2, packageRemaining: 5, packagePrice: 400, packageTotalHours: 10 });
    expect(r.packageHours).toBe(2);
    expect(r.cashHours).toBe(0);
    expect(r.cashAmount).toBe(0);
  });

  test('partial package coverage -> some cash hours', () => {
    const r = splitPackageAndCash({ servicePrice: 80, duration: 2, packageRemaining: 0.5, packagePrice: 400, packageTotalHours: 10 });
    expect(r.packageHours).toBe(0.5);
    expect(r.cashHours).toBe(1.5);
    expect(r.cashAmount).toBeGreaterThan(0);
  });

  test('no package -> all cash', () => {
    const r = splitPackageAndCash({ servicePrice: 80, duration: 1.5, packageRemaining: 0 });
    expect(r.packageHours).toBe(0);
    expect(r.cashHours).toBe(1.5);
    expect(r.cashAmount).toBeCloseTo(120);
  });

  test('wantsToUsePackage() covers all intents', () => {
    expect(wantsToUsePackage({ usePackage: true })).toBe(true);
    expect(wantsToUsePackage({ usePackage: 'true' })).toBe(true);
    expect(wantsToUsePackage({ customerPackageId: 123 })).toBe(true);
    expect(wantsToUsePackage({ paymentStatus: 'package' })).toBe(true);
    expect(wantsToUsePackage({ paymentStatus: 'partial' })).toBe(true);
    expect(wantsToUsePackage({})).toBe(false);
  });
});
