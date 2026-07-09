/* eslint-env jest */
/* global describe, it, expect */
import { buildForecast, MODEL_ORDER } from '../../../../backend/services/weather/index.js';

const h = (wspd) => ({
  dateLocal: '2026-07-09', timeLocal: '10:00', dayName: 'Thu', day: 9, hour: 10,
  wspdKn: wspd, gustKn: wspd + 4, dirText: 'N', dirDeg: 0, tempC: 25,
  pressureHpa: 1010, cloudHighPct: 0, cloudMidPct: 0, cloudLowPct: 0,
  precip3hMm: null, precip1hMm: 0, humidityPct: 50,
});

const bundle = {
  location: 'Urla, Gulbahce', lat: 38.3, lon: 26.6, altM: 1, sstC: 25, tzOffsetHours: 3, fetchedAt: 'x',
  models: [
    { key: 'wrf3', name: 'WRF', resolution: '3 km', initUtcIso: '2026-07-08T18:00:00Z', hours: [h(10)] },
    { key: 'icon7', name: 'ICON', resolution: '7 km', initUtcIso: '2026-07-09T00:00:00Z', hours: [h(14)] },
    { key: 'gfs13', name: 'GFS', resolution: '13 km', initUtcIso: '2026-07-09T00:00:00Z', hours: [h(99)] },
  ],
};

describe('buildForecast', () => {
  it('defaults to the UKC Mix', () => {
    const f = buildForecast(bundle, {});
    expect(f.model.key).toBe('mix');
    expect(f.hours[0].wspdKn).toBe(12); // median(10,14), gfs ignored
    expect(f.models.map((m) => m.key)).toEqual(
      MODEL_ORDER.filter((k) => k === 'mix' || ['wrf3', 'icon7', 'gfs13'].includes(k))
    );
  });

  it('returns a raw model when asked', () => {
    const f = buildForecast(bundle, { model: 'gfs13' });
    expect(f.model.key).toBe('gfs13');
    expect(f.hours[0].wspdKn).toBe(99);
  });

  it('throws on an unknown model', () => {
    expect(() => buildForecast(bundle, { model: 'nope' })).toThrow(/Unknown model/);
  });
});
