import { describe, it, expect } from 'vitest';
import { starRating, cloudPct, rainMm, dayColumns, daySourceLabel } from '@/features/wind-report/utils/forecastGrid';

describe('starRating', () => {
  it('bands by knots', () => {
    expect(starRating(null)).toBe(0);
    expect(starRating(5)).toBe(0);
    expect(starRating(10)).toBe(1);
    expect(starRating(14)).toBe(2);
    expect(starRating(22)).toBe(3);
  });
});

describe('cloudPct / rainMm', () => {
  it('cloud = max of the three layers', () => {
    expect(cloudPct({ cloudHighPct: 10, cloudMidPct: 40, cloudLowPct: 0 })).toBe(40);
    expect(cloudPct({ cloudHighPct: null, cloudMidPct: null, cloudLowPct: null })).toBeNull();
  });
  it('rain prefers 1h, falls back to 3h/3', () => {
    expect(rainMm({ precip1hMm: 2, precip3hMm: 9 })).toBe(2);
    expect(rainMm({ precip1hMm: null, precip3hMm: 9 })).toBe(3);
    expect(rainMm({ precip1hMm: null, precip3hMm: null })).toBeNull();
  });
});

describe('dayColumns', () => {
  it('keeps 06–22 ascending, drops night hours', () => {
    const rows = [{ hour: 23 }, { hour: 6 }, { hour: 14 }, { hour: 3 }];
    expect(dayColumns(rows).map((r) => r.hour)).toEqual([6, 14]);
  });
});

describe('daySourceLabel', () => {
  it('raw model rows (no sources) → the model name', () => {
    expect(daySourceLabel([{ hour: 10 }], 'WRF 3')).toBe('WRF 3');
  });
  it('mix rows → primary + count of others', () => {
    const rows = [{ sources: ['wrf3', 'icon7', 'ifs9'] }, { sources: ['ifs9'] }];
    expect(daySourceLabel(rows, 'UKC Mix')).toBe('WRF 3 +2');
  });
  it('mix rows with a single source → just that label', () => {
    expect(daySourceLabel([{ sources: ['ifs9'] }], 'UKC Mix')).toBe('IFS 9');
  });
});
