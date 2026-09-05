import { describe, it, expect } from 'vitest';
import {
  pickCounterpartCurrency,
  getRateBetween,
  convertWithRates,
  describeRate,
} from '../../../../src/shared/utils/currencyPreview.js';

// Regression tests for the Add Balance conversion preview (2026-09-05 incident:
// EUR — the base currency — was stored with exchange_rate 57.085, so 500 TRY
// previewed as "€507.42" instead of ~€8.89). Rates are currency_settings-style:
// units of currency per 1 base unit, base = 1.

const RATES = { EUR: '1.0000', TRY: '56.2512', USD: '1.1621', GBP: '0.8587' };
const ACTIVE = ['EUR', 'GBP', 'TRY', 'USD'];

describe('pickCounterpartCurrency', () => {
  it('typing a foreign currency previews the storage currency (what gets credited)', () => {
    expect(pickCounterpartCurrency({ inputCurrency: 'TRY', storageCurrency: 'EUR', activeCodes: ACTIVE })).toBe('EUR');
    expect(pickCounterpartCurrency({ inputCurrency: 'USD', storageCurrency: 'EUR', activeCodes: ACTIVE })).toBe('EUR');
  });

  it('typing the storage currency previews the local currency (TRY) when active', () => {
    expect(pickCounterpartCurrency({ inputCurrency: 'EUR', storageCurrency: 'EUR', walletCurrency: 'EUR', activeCodes: ACTIVE })).toBe('TRY');
  });

  it('falls back to the customer wallet currency, then any other active currency', () => {
    expect(pickCounterpartCurrency({ inputCurrency: 'EUR', storageCurrency: 'EUR', walletCurrency: 'USD', activeCodes: ['EUR', 'USD', 'GBP'] })).toBe('USD');
    expect(pickCounterpartCurrency({ inputCurrency: 'EUR', storageCurrency: 'EUR', walletCurrency: 'EUR', activeCodes: ['EUR', 'GBP'] })).toBe('GBP');
  });

  it('returns null in a single-currency setup', () => {
    expect(pickCounterpartCurrency({ inputCurrency: 'EUR', storageCurrency: 'EUR', activeCodes: ['EUR'] })).toBeNull();
  });

  it('ignores an inactive local currency', () => {
    expect(pickCounterpartCurrency({ inputCurrency: 'EUR', storageCurrency: 'EUR', walletCurrency: 'USD', activeCodes: ['EUR', 'USD'] })).toBe('USD');
  });
});

describe('getRateBetween / convertWithRates', () => {
  it('500 TRY is about €8.89 with the real September 2026 rate', () => {
    expect(convertWithRates(RATES, 500, 'TRY', 'EUR')).toBe(8.89);
  });

  it('€500 is about ₺28,125.60', () => {
    expect(convertWithRates(RATES, 500, 'EUR', 'TRY')).toBe(28125.6);
  });

  it('cross rates pivot through the base (USD → TRY)', () => {
    const rate = getRateBetween(RATES, 'USD', 'TRY');
    expect(rate).toBeCloseTo(56.2512 / 1.1621, 6);
  });

  it('same currency is identity', () => {
    expect(getRateBetween(RATES, 'EUR', 'EUR')).toBe(1);
    expect(convertWithRates(RATES, 12.34, 'TRY', 'TRY')).toBe(12.34);
  });

  it('never falls back to 1 when a rate is missing or invalid', () => {
    expect(getRateBetween({ EUR: '1' }, 'TRY', 'EUR')).toBeNull();
    expect(getRateBetween({ EUR: '1', TRY: '0' }, 'TRY', 'EUR')).toBeNull();
    expect(getRateBetween({ EUR: '1', TRY: 'abc' }, 'TRY', 'EUR')).toBeNull();
    expect(convertWithRates({ EUR: '1' }, 500, 'TRY', 'EUR')).toBeNull();
  });

  it('a corrupted base rate is what produced the €507 preview (documents the failure mode)', () => {
    // With EUR wrongly stored as 57.085 the pivot maths inflates every TRY→EUR figure ~57×.
    const corrupted = { ...RATES, EUR: '57.0850' };
    expect(convertWithRates(corrupted, 500, 'TRY', 'EUR')).toBe(507.41);
    // …and with the base pinned back to 1 the same input is correct again.
    expect(convertWithRates(RATES, 500, 'TRY', 'EUR')).toBe(8.89);
  });
});

describe('describeRate', () => {
  it('always describes the rate from the storage side, like Settings → Currency shows it', () => {
    expect(describeRate(RATES, 'EUR', 'TRY')).toBe('1 EUR = 56.2512 TRY');
  });

  it('returns null for same currency or missing rate', () => {
    expect(describeRate(RATES, 'EUR', 'EUR')).toBeNull();
    expect(describeRate({ EUR: '1' }, 'EUR', 'TRY')).toBeNull();
  });
});
