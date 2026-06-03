import Decimal from 'decimal.js';
import { formatMoney } from './money';

// Compute the three summary numbers from the line items, honoring per-total
// auto/override flags in price_summary._auto / _amounts.
// A line can have cash > regular (e.g. a premium add-on), so `savings` is a
// package-level number (regularTotal − cashPrice), never a per-row diff.
export function computeProposalTotals(content = {}, currencyCode = 'EUR') {
  const items = Array.isArray(content.package_items) ? content.package_items : [];
  const ps = content.price_summary || {};
  const auto = ps._auto || {};
  const amounts = ps._amounts || {};

  let regularSum = new Decimal(0);
  let cashSum = new Decimal(0);
  for (const it of items) {
    const a = it._amounts || {};
    regularSum = regularSum.plus(new Decimal(Number(a.regular) || 0));
    cashSum = cashSum.plus(new Decimal(Number(a.cash) || 0));
  }

  const regularTotal = auto.regular_total === false
    ? new Decimal(Number(amounts.regular_total) || 0)
    : regularSum;
  const cashPrice = auto.cash_price === false
    ? new Decimal(Number(amounts.cash_price) || 0)
    : cashSum;
  const savings = auto.savings === false
    ? new Decimal(Number(amounts.savings) || 0)
    : Decimal.max(0, regularTotal.minus(cashPrice));

  return {
    regularTotal: regularTotal.toNumber(),
    cashPrice: cashPrice.toNumber(),
    savings: savings.toNumber(),
    regularTotalStr: formatMoney(regularTotal.toNumber(), currencyCode),
    cashPriceStr: formatMoney(cashPrice.toNumber(), currencyCode),
    savingsStr: formatMoney(savings.toNumber(), currencyCode),
  };
}

// Return a copy of `content` whose price_summary display strings + _amounts are
// refreshed for any total still in auto mode. Manual (override) totals are left
// untouched. Call this after every content edit in the builder.
export function withSyncedTotals(content = {}, currencyCode = 'EUR') {
  const totals = computeProposalTotals(content, currencyCode);
  const ps = { ...(content.price_summary || {}) };
  const auto = ps._auto || { regular_total: true, savings: true, cash_price: true };
  const amounts = { ...(ps._amounts || {}) };
  if (auto.regular_total !== false) { ps.regular_total = totals.regularTotalStr; amounts.regular_total = totals.regularTotal; }
  if (auto.savings !== false) { ps.savings = totals.savingsStr; amounts.savings = totals.savings; }
  if (auto.cash_price !== false) { ps.cash_price = totals.cashPriceStr; amounts.cash_price = totals.cashPrice; }
  ps._amounts = amounts;
  ps._auto = auto;
  return { ...content, price_summary: ps };
}
