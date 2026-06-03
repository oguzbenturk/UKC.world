import Decimal from 'decimal.js';

/** Format a numeric amount in the prototype's "250 EUR" style (no decimals when whole). */
export function formatMoney(amount, currencyCode = 'EUR') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  const rounded = new Decimal(n).toDecimalPlaces(2);
  const str = rounded.isInteger() ? rounded.toFixed(0) : rounded.toFixed(2);
  return `${str} ${currencyCode}`.trim();
}

/** Best-effort parse of a money string like "250 EUR" / "€250" / "1.250,50" → number (or null). */
export function parseMoney(str) {
  if (typeof str === 'number') return str;
  if (!str) return null;
  const cleaned = String(str).replace(/[^\d.,-]/g, '').trim();
  if (!cleaned) return null;
  // Treat the last separator as decimal if both present; otherwise strip thousands.
  let normalized = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
