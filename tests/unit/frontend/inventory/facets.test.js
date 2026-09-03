import { describe, test, expect } from 'vitest';
import {
  EMPTY_FILTERS, normalizeUnit, applyFilters, buildFacets, isFilterActive, toggleIn, retally, emptyCounts, tallyStatus,
} from '@/features/inventory/utils/facets';

const rows = [
  { id: 1, type: 'kite', brand: 'Duotone', name: 'Mono', size: '9m', condition: 'good', availability: 'available', serial_number: 'K-001' },
  { id: 2, type: 'kite', brand: 'Duotone', name: 'Mono 22', size: '7', condition: 'fair', availability: 'maintenance', serial_number: 'K-002' },
  { id: 3, type: 'kite', brand: 'Core', name: 'XR7', size: '9m', condition: 'poor', availability: 'available', serial_number: 'K-003' },
  { id: 4, type: 'harness', brand: 'ION', name: 'Seat Harness', size: 'M', condition: 'good', availability: 'available', serial_number: 'H-001' },
  { id: 5, type: 'harness', brand: 'ION', name: 'Belt Harness', size: 'M', condition: 'good', availability: 'available', serial_number: 'H-002' },
  { id: 6, type: 'Harness', brand: '', name: 'Belt', size: 'l', condition: 'Good', availability: 'Available', serial_number: 'H-003' },
];
const units = rows.map(normalizeUnit);
const f = (patch) => ({ ...EMPTY_FILTERS, ...patch });
const ids = (list) => list.map((u) => u.id);

describe('normalizeUnit', () => {
  test('derives keys, folds case and builds the search blob', () => {
    const u = units[1];
    expect(u.typeKey).toBe('kite');
    expect(u.sizeKey).toBe('7m');
    expect(u.status).toBe('maintenance');
    expect(u.family).toBe('mono');
    expect(u.searchBlob).toContain('k-002');
    const capitalised = units[5];
    expect(capitalised.typeKey).toBe('harness');
    expect(capitalised.condition).toBe('good');
    expect(capitalised.status).toBe('available');
    expect(capitalised.sizeKey).toBe('L');
    expect(capitalised.subtypes).toEqual(['waist']);
  });
});

describe('applyFilters', () => {
  test('each facet narrows the set', () => {
    expect(ids(applyFilters(units, f({ type: 'kite' })))).toEqual([1, 2, 3]);
    expect(ids(applyFilters(units, f({ type: 'kite', sizes: ['9m'] })))).toEqual([1, 3]);
    expect(ids(applyFilters(units, f({ type: 'harness', subtypes: ['waist'] })))).toEqual([5, 6]);
    expect(ids(applyFilters(units, f({ brands: ['Core', 'Other'] })))).toEqual([3, 6]);
    expect(ids(applyFilters(units, f({ conditions: ['poor', 'fair'] })))).toEqual([2, 3]);
    expect(ids(applyFilters(units, f({ statuses: ['maintenance'] })))).toEqual([2]);
    expect(ids(applyFilters(units, f({ q: 'k-00' })))).toEqual([1, 2, 3]);
    expect(ids(applyFilters(units, f({ q: 'MONO' })))).toEqual([1, 2]);
  });
  test('skip ignores a facet', () => {
    expect(ids(applyFilters(units, f({ type: 'kite', statuses: ['maintenance'] }), new Set(['statuses'])))).toEqual([1, 2, 3]);
  });
});

describe('buildFacets', () => {
  test('counts each facet against the other active facets', () => {
    const facets = buildFacets(units, f({ brands: ['Duotone'] }));
    expect(ids(facets.result)).toEqual([1, 2]);
    // Brand counts ignore the brand filter itself, so other brands stay listed.
    expect(facets.brand).toEqual({ Duotone: 2, Core: 1, ION: 2, Other: 1 });
    // Type counts honour the brand filter.
    expect(facets.type).toEqual({ kite: 2 });
    expect(facets.size).toBeNull();
    expect(facets.subtype).toBeNull();
  });
  test('size and sub-type facets appear once a type is chosen', () => {
    const facets = buildFacets(units, f({ type: 'harness', subtypes: ['seat'] }));
    expect(facets.size).toEqual({ M: 1 });
    // Sub-type counts ignore the sub-type filter.
    expect(facets.subtype).toEqual({ seat: 1, waist: 2 });
    // Type counts ignore type, sizes and sub-types.
    expect(facets.type).toEqual({ kite: 3, harness: 3 });
  });
});

describe('helpers', () => {
  test('isFilterActive and toggleIn', () => {
    expect(isFilterActive(EMPTY_FILTERS)).toBe(false);
    expect(isFilterActive(f({ q: ' ' }))).toBe(false);
    expect(isFilterActive(f({ sizes: ['9m'] }))).toBe(true);
    expect(toggleIn(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b']);
  });
  test('retally recounts a group and its base', () => {
    const base = { units: units.slice(0, 3), ...emptyCounts() };
    units.slice(0, 3).forEach((u) => tallyStatus(base, u.status));
    const sliced = { units: [units[0]], base, ...emptyCounts() };
    const changed = { ...sliced, units: [{ ...units[0], status: 'maintenance' }], base: { ...base, units: base.units.map((u) => (u.id === 1 ? { ...u, status: 'maintenance' } : u)) } };
    const out = retally(changed);
    expect(out.maintenance_count).toBe(1);
    expect(out.available_count).toBe(0);
    expect(out.base.maintenance_count).toBe(2);
    expect(out.base.cells['9m'].maintenance_count).toBe(1);
  });
});
