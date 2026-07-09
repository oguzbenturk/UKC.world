/* eslint-env jest */
/* global describe, it, expect */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseAllModels } from '../windguruScraper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', '__fixtures__', 'windguru-574666.html'), 'utf8');

const spanDays = (hours) => {
  const ts = hours.map((h) => Date.parse(h.dateLocal));
  return (Math.max(...ts) - Math.min(...ts)) / 86400000;
};

describe('parseAllModels', () => {
  const parsed = parseAllModels(html);
  const byKey = Object.fromEntries(parsed.models.map((m) => [m.key, m]));

  it('parses the location header', () => {
    expect(parsed.location).toMatch(/Gulbahce/);
    expect(parsed.tzOffsetHours).toBe(3);
  });

  it('parses every wind model and excludes wave models', () => {
    const keys = parsed.models.map((m) => m.key);
    expect(keys).toEqual(expect.arrayContaining(['gfs13', 'ifs9', 'wrf3', 'wrf9', 'icon7', 'icon13']));
    // wave blocks (GFS-Wave / IFS-WAM / GDWPS) have no WSPD column → never parsed
    expect(keys.some((k) => k.includes('wave') || k.includes('wam') || k.includes('gdwps'))).toBe(false);
  });

  it('reads WSPD/GUST as numbers for every model', () => {
    for (const m of parsed.models) {
      expect(m.hours.length).toBeGreaterThan(0);
      for (const h of m.hours) {
        expect(h.wspdKn === null || typeof h.wspdKn === 'number').toBe(true);
        expect(h.hour).toBeGreaterThanOrEqual(0);
        expect(h.hour).toBeLessThanOrEqual(23);
      }
    }
  });

  it('does NOT emit phantom far-future dates (per-block date cursor)', () => {
    // The old parser bled later model tables into future months. WRF 3 only reaches ~2d.
    expect(spanDays(byKey.wrf3.hours)).toBeLessThanOrEqual(3);
    expect(spanDays(byKey.gfs13.hours)).toBeLessThanOrEqual(20);
  });

  it('maps variable columns: WRF 3 has no APCP(3h), GFS has it', () => {
    expect(byKey.wrf3.hours.every((h) => h.precip3hMm === null)).toBe(true);
    expect(byKey.wrf3.hours.some((h) => h.precip1hMm !== null)).toBe(true);
    expect(byKey.gfs13.hours.some((h) => h.precip3hMm !== null || h.precip3hMm === 0)).toBe(true);
  });
});
