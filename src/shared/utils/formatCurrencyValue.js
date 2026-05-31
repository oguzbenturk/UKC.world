// Pure money formatter shared by CurrencyContext.formatCurrency. Kept as a separate
// unit so it is testable without rendering the provider (which fetches currencies).
//
// Money must NEVER be Math.round'ed to whole units for display — that silently drops
// cents (€1.50 → "€2"). We render the currency's own decimal_places (default 2).
export function formatCurrencyValue(amount, { symbol = '', decimalPlaces } = {}) {
  const numAmount = parseFloat(amount) || 0;
  const decimals = Number.isInteger(decimalPlaces) ? decimalPlaces : 2;
  return `${symbol}${numAmount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
