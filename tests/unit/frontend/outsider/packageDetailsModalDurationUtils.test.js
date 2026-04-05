import { describe, expect, it } from 'vitest';
import {
  buildCustomProRataDuration,
  inferHourlyProRataBase,
  parseLessonDurationHours,
  roundCurrency,
} from '@/features/outsider/utils/packageDetailsModalDurationUtils';

describe('parseLessonDurationHours', () => {
  it('reads hoursNumeric when in range', () => {
    expect(parseLessonDurationHours({ hoursNumeric: 1, price: 100 })).toBe(1);
    expect(parseLessonDurationHours({ hoursNumeric: 6, price: 400 })).toBe(6);
  });

  it('returns null for hours beyond hourly cap', () => {
    expect(parseLessonDurationHours({ hoursNumeric: 72, price: 100 })).toBeNull();
  });

  it('parses suffixed h strings', () => {
    expect(parseLessonDurationHours({ hours: '1.5h', price: 50 })).toBe(1.5);
  });

  it('returns null for day or week labels', () => {
    expect(parseLessonDurationHours({ hours: '7d', price: 100 })).toBeNull();
    expect(parseLessonDurationHours({ hours: '1 week', price: 100 })).toBeNull();
  });
});

describe('inferHourlyProRataBase', () => {
  it('uses shortest hourly row as anchor', () => {
    const base = inferHourlyProRataBase([
      { hours: '6h', price: 600, packageId: 'p1' },
      { hours: '1h', price: 120, packageId: 'p1' },
    ]);
    expect(base).not.toBeNull();
    expect(base.anchorHours).toBe(1);
    expect(base.hourlyRate).toBe(120);
    expect(base.anchorDur.packageId).toBe('p1');
  });

  it('returns null when no hourly rows', () => {
    expect(inferHourlyProRataBase([{ hours: '7d', price: 200 }])).toBeNull();
  });
});

describe('buildCustomProRataDuration', () => {
  const base = inferHourlyProRataBase([{ hours: '1h', price: 120, packageId: 'pkg', serviceId: 'svc' }]);

  it('computes 2h from €120/h base as €240', () => {
    const row = buildCustomProRataDuration(base, 2);
    expect(row.hours).toBe('2h');
    expect(row.hoursNumeric).toBe(2);
    expect(row.price).toBe(240);
    expect(row.isCustomProRata).toBe(true);
    expect(row.packageId).toBe('pkg');
  });

  it('supports half-hour steps', () => {
    const row = buildCustomProRataDuration(base, 2.5);
    expect(row.price).toBe(300);
  });
});

describe('roundCurrency', () => {
  it('rounds to two decimals', () => {
    expect(roundCurrency(10.126)).toBe(10.13);
  });
});
