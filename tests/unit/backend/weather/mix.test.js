/* eslint-env jest */
/* global describe, it, expect */
import { median, circularMeanDeg, buildMix, MIX_MODELS } from '../../../../backend/services/weather/mix.js';

describe('median', () => {
  it('odd length', () => expect(median([3, 1, 2])).toBe(2));
  it('even length averages the middle two', () => expect(median([4, 1, 2, 3])).toBe(2.5));
  it('drops nulls', () => expect(median([5, null, 7])).toBe(6));
  it('empty → null', () => expect(median([null, undefined])).toBeNull());
});

describe('circularMeanDeg', () => {
  it('wraps across 0 (350 & 10 → ~0)', () => {
    const v = circularMeanDeg([350, 10]);
    expect(Math.min(v, 360 - v)).toBeLessThan(0.5);
  });
  it('constant', () => expect(Math.round(circularMeanDeg([90, 90, 90]))).toBe(90));
});

describe('buildMix', () => {
  const hour = (over) => ({
    dateLocal: '2026-07-09', timeLocal: '10:00', dayName: 'Thu', day: 9, hour: 10,
    wspdKn: null, gustKn: null, dirText: null, dirDeg: null, tempC: null,
    pressureHpa: null, cloudHighPct: null, cloudMidPct: null, cloudLowPct: null,
    precip3hMm: null, precip1hMm: null, humidityPct: null, ...over,
  });
  const models = [
    { key: 'wrf3', hours: [hour({ wspdKn: 10, gustKn: 14, dirDeg: 350, tempC: 25, cloudHighPct: 10, precip1hMm: 0 })] },
    { key: 'icon7', hours: [hour({ wspdKn: 14, gustKn: 18, dirDeg: 10, tempC: 27, cloudHighPct: 0, precip1hMm: 0 })] },
    { key: 'gfs13', hours: [hour({ wspdKn: 99, gustKn: 99, dirDeg: 180 })] }, // must be ignored
  ];

  it('medians only the MIX_MODELS and tags sources', () => {
    const { hours, contributors } = buildMix(models);
    expect(hours).toHaveLength(1);
    expect(hours[0].wspdKn).toBe(12);           // median(10,14)
    expect(hours[0].gustKn).toBe(16);           // median(14,18)
    expect(Math.min(hours[0].dirDeg, 360 - hours[0].dirDeg)).toBeLessThan(1); // ~0
    expect(hours[0].sources.sort()).toEqual(['icon7', 'wrf3']);
    expect(contributors.sort()).toEqual(['icon7', 'wrf3']);
    expect(MIX_MODELS).not.toContain('gfs13');
  });
});
