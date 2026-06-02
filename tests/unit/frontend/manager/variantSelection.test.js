// tests/unit/frontend/manager/variantSelection.test.js
//
// Tests for the shared point-of-sale variant helpers used by both the admin
// New Sale drawer and the front-desk Quick Sale modal. These lock the
// colour×size matrix selection contract: sizes filter by colour, and stock +
// price resolve from the exact (colour, size) combination.

import { describe, it, expect } from 'vitest';
import {
  buildVariantIndex,
  buildSizeOptions,
  normalizeColors,
  sizeOptionsFor,
  resolveCombo,
} from '@/features/products/utils/variantSelection';

const matrixProduct = {
  price: 29,
  variants: [
    { color: 'Blue', label: 'XS', size: 'XS', quantity: 3, price: 29 },
    { color: 'Blue', label: 'S', size: 'S', quantity: 0, price: 29 },
    { color: 'Red', label: 'XS', size: 'XS', quantity: 2, price: 32 },
  ],
};

const legacyProduct = {
  price: 100,
  variants: [
    { label: '12m', quantity: 4, price: 1200 },
    { label: '10m', quantity: 0, price: 1100 },
  ],
  colors: [{ name: 'Red', imageCount: 2 }, { name: 'Blue', imageCount: 1 }],
};

describe('buildVariantIndex', () => {
  it('detects a colour×size matrix and lists unique colours', () => {
    const idx = buildVariantIndex(matrixProduct);
    expect(idx.isMatrix).toBe(true);
    expect(idx.colors).toEqual(['Blue', 'Red']);
  });

  it('treats a size-only product as non-matrix, colours from the colours array', () => {
    const idx = buildVariantIndex(legacyProduct);
    expect(idx.isMatrix).toBe(false);
    expect(idx.colors).toEqual(['Red', 'Blue']);
  });

  it('parses JSON-string variants/colors', () => {
    const idx = buildVariantIndex({
      price: 5,
      variants: JSON.stringify([{ color: 'Black', label: 'M', quantity: 1 }]),
    });
    expect(idx.isMatrix).toBe(true);
    expect(idx.colors).toEqual(['Black']);
  });
});

describe('sizeOptionsFor', () => {
  it('returns only the sizes the chosen colour carries (matrix)', () => {
    const idx = buildVariantIndex(matrixProduct);
    const blue = sizeOptionsFor({ ...idx, color: 'Blue' });
    expect(blue.map(o => o.label)).toEqual(['XS', 'S']);
    const red = sizeOptionsFor({ ...idx, color: 'Red' });
    expect(red.map(o => o.label)).toEqual(['XS']);
  });

  it('returns nothing until a colour is picked (matrix)', () => {
    const idx = buildVariantIndex(matrixProduct);
    expect(sizeOptionsFor({ ...idx, color: null })).toEqual([]);
  });

  it('returns the flat size list for a legacy product', () => {
    const idx = buildVariantIndex(legacyProduct);
    const opts = sizeOptionsFor({ ...idx, sizeOptions: buildSizeOptions(legacyProduct), color: null });
    expect(opts.map(o => o.label)).toEqual(['12m', '10m']);
  });
});

describe('resolveCombo', () => {
  it('resolves stock + price for the exact (colour, size) cell', () => {
    const idx = buildVariantIndex(matrixProduct);
    expect(resolveCombo({ ...idx, color: 'Blue', size: 'XS' })).toEqual({ stock: 3, price: 29 });
    expect(resolveCombo({ ...idx, color: 'Red', size: 'XS' })).toEqual({ stock: 2, price: 32 });
  });

  it('returns zero stock for an out-of-stock combo', () => {
    const idx = buildVariantIndex(matrixProduct);
    expect(resolveCombo({ ...idx, color: 'Blue', size: 'S' })).toEqual({ stock: 0, price: 29 });
  });

  it('returns null stock/price until both colour and size are chosen', () => {
    const idx = buildVariantIndex(matrixProduct);
    expect(resolveCombo({ ...idx, color: 'Blue', size: null })).toEqual({ stock: null, price: null });
    expect(resolveCombo({ ...idx, color: null, size: 'XS' })).toEqual({ stock: null, price: null });
  });

  it('resolves a legacy size-only combo by size label', () => {
    const idx = buildVariantIndex(legacyProduct);
    const sizeOptions = buildSizeOptions(legacyProduct);
    expect(resolveCombo({ ...idx, sizeOptions, color: null, size: '12m' })).toEqual({ stock: 4, price: 1200 });
  });
});

describe('normalizeColors', () => {
  it('handles object and string colour arrays', () => {
    expect(normalizeColors([{ name: 'Red' }, { name: 'Blue' }])).toEqual(['Red', 'Blue']);
    expect(normalizeColors(['Red', 'Blue'])).toEqual(['Red', 'Blue']);
    expect(normalizeColors(null)).toEqual([]);
  });
});
