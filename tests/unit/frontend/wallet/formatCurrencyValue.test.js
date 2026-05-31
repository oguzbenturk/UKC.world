// Wave 4 — guards the wallet money-display fix: formatCurrency must show cents, not
// Math.round money to whole units (which rendered €1.50 as "€2" and lost cents).
import { describe, it, expect } from 'vitest';
import { formatCurrencyValue } from '../../../../src/shared/utils/formatCurrencyValue.js';

describe('formatCurrencyValue', () => {
  it('preserves cents (the bug: 1.50 used to render as 2)', () => {
    expect(formatCurrencyValue(1.5, { symbol: '€' })).toBe('€1.50');
    expect(formatCurrencyValue(1.49, { symbol: '€' })).toBe('€1.49');
    expect(formatCurrencyValue(1234.99, { symbol: '€' })).toBe('€1,234.99');
  });

  it('defaults to 2 decimals and handles non-numeric/empty as 0', () => {
    expect(formatCurrencyValue(0, { symbol: '€' })).toBe('€0.00');
    expect(formatCurrencyValue(undefined, { symbol: '€' })).toBe('€0.00');
    expect(formatCurrencyValue('abc', { symbol: '$' })).toBe('$0.00');
  });

  it('respects an explicit per-currency decimal_places', () => {
    expect(formatCurrencyValue(1500, { symbol: '₺', decimalPlaces: 0 })).toBe('₺1,500');
    expect(formatCurrencyValue(1500.5, { symbol: '₺', decimalPlaces: 0 })).toBe('₺1,501');
  });

  it('keeps negative balances signed (symbol-prefixed, matching prior behaviour)', () => {
    expect(formatCurrencyValue(-12.3, { symbol: '€' })).toBe('€-12.30');
  });
});
