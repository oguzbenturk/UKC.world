import { describe, test, expect } from 'vitest';
import {
  filtersFromSearchParams, writeFiltersToSearchParams, tabFromSearchParams, migrateStoredView,
} from '@/features/inventory/utils/urlState';
import { EMPTY_FILTERS } from '@/features/inventory/utils/facets';

const known = new Set(['kite', 'wetsuit']);

describe('urlState', () => {
  test('round-trips filters through the URL', () => {
    const filters = {
      q: 'mono', type: 'kite', sizes: ['7m', '—'], subtypes: ['5line'], brands: ['Liquid Force', 'ION'],
      conditions: ['poor'], statuses: ['maintenance'],
    };
    const sp = writeFiltersToSearchParams(new URLSearchParams('foo=bar'), filters, 'planning');
    expect(sp.get('foo')).toBe('bar');
    expect(sp.get('size')).toBe('7m,none');
    expect(sp.get('tab')).toBe('planning');
    expect(filtersFromSearchParams(sp, known)).toEqual(filters);
    expect(tabFromSearchParams(sp)).toBe('planning');
  });

  test('drops invalid values and type-scoped facets without a type', () => {
    const sp = new URLSearchParams('type=bogus&size=7m&sub=seat&cond=bogus,poor&status=nope&tab=nope');
    expect(filtersFromSearchParams(sp, known)).toEqual({ ...EMPTY_FILTERS, conditions: ['poor'] });
    expect(tabFromSearchParams(sp)).toBe('inventory');
    const bogusSub = new URLSearchParams('type=kite&sub=bogus,5line');
    expect(filtersFromSearchParams(bogusSub, known).subtypes).toEqual(['5line']);
  });

  test('empty filters clear their keys and the inventory tab is omitted', () => {
    const prev = new URLSearchParams('type=kite&size=7m&tab=stocktake&q=x');
    const sp = writeFiltersToSearchParams(prev, EMPTY_FILTERS, 'inventory');
    expect(sp.toString()).toBe('');
    // Leaving tab undefined keeps whatever was there.
    expect(writeFiltersToSearchParams(prev, EMPTY_FILTERS).get('tab')).toBe('stocktake');
  });

  test('migrates stored view modes', () => {
    expect(migrateStoredView('table')).toBe('list');
    expect(migrateStoredView('planning')).toBe('grid');
    expect(migrateStoredView('cards')).toBe('cards');
    expect(migrateStoredView(undefined)).toBe('grid');
  });
});
