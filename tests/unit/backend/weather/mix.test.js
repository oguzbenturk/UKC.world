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
  it('empty or all-null → null', () => {
    expect(circularMeanDeg([])).toBeNull();
    expect(circularMeanDeg([null])).toBeNull();
  });
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
    // passthrough + blended fields
    expect(hours[0].dateLocal).toBe('2026-07-09');
    expect(hours[0].hour).toBe(10);
    expect(hours[0].tempC).toBe(26);            // median(25,27)
    expect(hours[0].precip1hMm).toBe(0);
    // fields intentionally left un-blended
    expect(hours[0].cloudMidPct).toBeNull();
    expect(hours[0].cloudLowPct).toBeNull();
    expect(hours[0].precip3hMm).toBeNull();
  });

  it('medians each cloud layer independently (not collapsed to a single max)', () => {
    const cloudModels = [
      { key: 'wrf3', hours: [hour({ cloudHighPct: 10, cloudMidPct: 40, cloudLowPct: 0 })] },
      { key: 'icon7', hours: [hour({ cloudHighPct: 20, cloudMidPct: 0, cloudLowPct: 0 })] },
    ];
    const { hours } = buildMix(cloudModels);
    expect(hours).toHaveLength(1);
    // Under the old collapse-to-max behavior this would have been cloudHighPct===30, cloudMidPct/cloudLowPct===null.
    expect(hours[0].cloudHighPct).toBe(15);   // median(10,20)
    expect(hours[0].cloudMidPct).toBe(20);    // median(40,0)
    expect(hours[0].cloudLowPct).toBe(0);     // median(0,0)
  });

  it('a single-contributor slot passes that model through untouched', () => {
    const soloModels = [
      { key: 'wrf3', hours: [hour({ wspdKn: 11 })] },
    ];
    const { hours } = buildMix(soloModels);
    expect(hours).toHaveLength(1);
    expect(hours[0].wspdKn).toBe(11);
    expect(hours[0].sources).toEqual(['wrf3']);
  });

  it('sorts multiple slots by hour ascending', () => {
    const multiHourModels = [
      { key: 'wrf3', hours: [hour({ hour: 11, wspdKn: 20 }), hour({ hour: 9, wspdKn: 8 })] },
    ];
    const { hours } = buildMix(multiHourModels);
    expect(hours).toHaveLength(2);
    expect(hours.map((h) => h.hour)).toEqual([9, 11]);
  });

  it('empty input → empty hours and contributors', () => {
    const { hours, contributors } = buildMix([]);
    expect(hours).toHaveLength(0);
    expect(contributors).toHaveLength(0);
  });
});
