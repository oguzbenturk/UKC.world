// tests/unit/frontend/manager/variantMatrix.test.js
//
// Tests for the pure colour x size <-> variants[] conversion behind the
// product form's stock grid. These lock the contract every downstream
// consumer relies on:
//   - backend stock decrement matches on label (size) AND color
//   - the customer storefront reads color + size + stock and greys
//     out-of-stock combos per colour
//   - re-opening a saved product rebuilds the exact same grid

import { describe, it, expect } from 'vitest';
import {
  cellKey,
  hydrateMatrix,
  buildVariants,
} from '@/features/products/utils/variantMatrix';

describe('buildVariants', () => {
  it('emits one variant per (stocked colour) x (size), carrying both naming conventions', () => {
    const variants = buildVariants(
      ['Blue', 'Red'],
      ['XS', 'S'],
      {
        [cellKey('Blue', 'XS')]: 3,
        [cellKey('Blue', 'S')]: 5,
        [cellKey('Red', 'XS')]: 0,
        [cellKey('Red', 'S')]: 4,
      },
      { XS: 29, S: 29 },
      { XS: 12, S: 12 },
    );

    // 2 colours x 2 sizes = 4 rows (Red/XS kept at 0 so the size greys out).
    expect(variants).toHaveLength(4);

    const blueXs = variants.find((v) => v.color === 'Blue' && v.size === 'XS');
    expect(blueXs).toMatchObject({
      color: 'Blue',
      label: 'XS', // backend decrement key
      size: 'XS', // storefront size key
      quantity: 3, // backend stock
      stock: 3, // storefront availability
      price: 29,
      price_final: 29,
      cost_price: 12,
    });
  });

  it('omits a colour with zero stock across every size (no dead storefront swatch)', () => {
    const variants = buildVariants(
      ['Blue', 'Green'],
      ['XS', 'S'],
      {
        [cellKey('Blue', 'XS')]: 2,
        // Green has nothing
      },
      {},
      {},
    );
    const colors = [...new Set(variants.map((v) => v.color))];
    expect(colors).toEqual(['Blue']);
  });

  it('keeps 0-stock sizes for a stocked colour so the storefront can grey them', () => {
    const variants = buildVariants(
      ['Blue'],
      ['XS', 'S', 'M'],
      { [cellKey('Blue', 'S')]: 4 },
      {},
      {},
    );
    expect(variants).toHaveLength(3);
    expect(variants.find((v) => v.size === 'XS').stock).toBe(0);
    expect(variants.find((v) => v.size === 'S').stock).toBe(4);
  });

  it('uses null prices when none are set (lets the top-level product price take over)', () => {
    const [variant] = buildVariants(['Blue'], ['XS'], { [cellKey('Blue', 'XS')]: 1 });
    expect(variant.price).toBeNull();
    expect(variant.cost_price).toBeNull();
  });

  it('returns an empty array when nothing is stocked', () => {
    expect(buildVariants(['Blue'], ['XS'], {})).toEqual([]);
    expect(buildVariants([], [], {})).toEqual([]);
  });
});

describe('hydrateMatrix', () => {
  it('rebuilds the grid from a saved colour x size variants array', () => {
    const value = [
      { color: 'Blue', label: 'XS', quantity: 3, price: 29, cost_price: 12 },
      { color: 'Blue', label: 'S', quantity: 5, price: 29, cost_price: 12 },
      { color: 'Red', label: 'S', quantity: 4, price: 29, cost_price: 12 },
    ];
    const { sizes, cells, sizePrice, sizeCost, legacyBySize } = hydrateMatrix(value);

    expect(sizes).toEqual(['XS', 'S']);
    expect(cells[cellKey('Blue', 'XS')]).toBe(3);
    expect(cells[cellKey('Red', 'S')]).toBe(4);
    expect(sizePrice).toEqual({ XS: 29, S: 29 });
    expect(sizeCost).toEqual({ XS: 12, S: 12 });
    expect(legacyBySize).toEqual({});
  });

  it('round-trips losslessly through build -> hydrate -> build', () => {
    const colorNames = ['Blue', 'Red'];
    const sizes = ['XS', 'S'];
    const cells = {
      [cellKey('Blue', 'XS')]: 3,
      [cellKey('Blue', 'S')]: 5,
      [cellKey('Red', 'XS')]: 0,
      [cellKey('Red', 'S')]: 4,
    };
    const sizePrice = { XS: 29, S: 29 };
    const sizeCost = { XS: 12, S: 12 };

    const variants = buildVariants(colorNames, sizes, cells, sizePrice, sizeCost);
    const rebuilt = hydrateMatrix(variants);
    const variants2 = buildVariants(colorNames, rebuilt.sizes, rebuilt.cells, rebuilt.sizePrice, rebuilt.sizeCost);

    expect(variants2).toEqual(variants);
  });

  it('reads the storefront/scraper field names (size, stock) as fallbacks for label/quantity', () => {
    const value = [{ color: 'Blue', size: 'M', stock: 7, price: 40 }];
    const { sizes, cells } = hydrateMatrix(value);
    expect(sizes).toEqual(['M']);
    expect(cells[cellKey('Blue', 'M')]).toBe(7);
  });

  it('flags colour-less (legacy size-only) stock instead of silently dropping it', () => {
    const value = [
      { label: 'XS', quantity: 3, price: 29 }, // no colour
      { label: 'S', quantity: 5, price: 29 }, // no colour
    ];
    const { sizes, cells, legacyBySize, sizePrice } = hydrateMatrix(value);
    expect(sizes).toEqual(['XS', 'S']); // sizes + prices are still seeded
    expect(sizePrice).toEqual({ XS: 29, S: 29 });
    expect(Object.keys(cells)).toHaveLength(0); // but no colour cells can be filled
    expect(legacyBySize).toEqual({ XS: 3, S: 5 }); // surfaced for re-entry
  });

  it('handles non-array / empty input defensively', () => {
    expect(hydrateMatrix(undefined).sizes).toEqual([]);
    expect(hydrateMatrix(null).cells).toEqual({});
    expect(hydrateMatrix('not-an-array').sizes).toEqual([]);
  });
});
