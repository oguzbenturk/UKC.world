// Pure helpers for the "you typed X in currency A → here is what that is in currency B"
// previews (Add Balance, charges, …). Kept free of React so they can be unit-tested and
// reused; the rates always come from currency_settings via CurrencyContext.exchangeRates
// (units of currency per 1 base-currency unit, base = 1).

// The platform's local/cash currency: Iyzico settles in TRY and desk deposits are taken in
// lira, so when the admin types the storage currency (EUR) this is the counterpart shown.
export const LOCAL_CURRENCY = 'TRY';

/**
 * Which currency the preview should translate INTO.
 *
 *  - Typing a non-storage currency (TRY, USD…): show the storage currency — that's what
 *    the wallet will actually be credited with.
 *  - Typing the storage currency (EUR): show the local currency (TRY) when it's active;
 *    otherwise the customer's own wallet currency; otherwise any other active currency.
 *
 * Returns null when there is nothing meaningful to show (single-currency setups).
 */
export function pickCounterpartCurrency({
  inputCurrency,
  storageCurrency,
  walletCurrency = null,
  activeCodes = [],
  localCurrency = LOCAL_CURRENCY,
}) {
  const active = new Set((activeCodes || []).filter(Boolean));
  if (!inputCurrency || !storageCurrency) return null;

  if (inputCurrency !== storageCurrency) return storageCurrency;

  const candidates = [localCurrency, walletCurrency, ...active];
  for (const code of candidates) {
    if (code && code !== storageCurrency && active.has(code)) return code;
  }
  return null;
}

/**
 * How many units of `to` one unit of `from` buys, using base-pivot rates
 * (rate[X] = units of X per 1 base). Returns null when either rate is missing —
 * callers must NOT fall back to 1, that silently produces wrong money.
 */
export function getRateBetween(exchangeRates, from, to) {
  if (!from || !to) return null;
  if (from === to) return 1;
  const fromRate = Number.parseFloat(exchangeRates?.[from]);
  const toRate = Number.parseFloat(exchangeRates?.[to]);
  if (!Number.isFinite(fromRate) || fromRate <= 0) return null;
  if (!Number.isFinite(toRate) || toRate <= 0) return null;
  return toRate / fromRate;
}

/**
 * Convert `amount` of `from` into `to` with base-pivot rates, rounded to cents
 * (half-up — this is a preview of an amount the backend will compute with Decimal.js,
 * not a customer-facing price, so no ceil()). Returns null when a rate is missing.
 */
export function convertWithRates(exchangeRates, amount, from, to) {
  const value = Number.parseFloat(amount);
  if (!Number.isFinite(value)) return null;
  const rate = getRateBetween(exchangeRates, from, to);
  if (rate === null) return null;
  return Math.round(value * rate * 100) / 100;
}

/**
 * Human-readable rate line, always expressed from the base/storage side so it matches
 * what Settings → Currency shows ("1 EUR = 56.2512 TRY"), whichever way the admin typed.
 */
export function describeRate(exchangeRates, storageCurrency, otherCurrency, digits = 4) {
  const rate = getRateBetween(exchangeRates, storageCurrency, otherCurrency);
  if (rate === null || !otherCurrency || otherCurrency === storageCurrency) return null;
  return `1 ${storageCurrency} = ${rate.toFixed(digits)} ${otherCurrency}`;
}
