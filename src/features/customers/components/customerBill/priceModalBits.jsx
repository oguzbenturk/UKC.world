import { useState, useCallback } from 'react';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

// Submit/error state shared by price-mutation modals. `validate` returns a
// string to short-circuit with that as the error.
export function useApiSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (fn, { validate } = {}) => {
    if (validate) {
      const v = validate();
      if (v) { setError(v); return; }
    }
    setSubmitting(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err?.message || 'Request failed');
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submitting, error, setError, run };
}

// Three-row Original / (Current or Discount) / Final preview shared by the
// discount and price-edit modals.
export function PriceSummaryRows({
  currency,
  originalPrice = null,
  currentPrice = null,
  discountAmount = null,
  finalPrice,
  finalLabel = 'Final',
  delta = null,
}) {
  const { formatCurrency } = useCurrency();
  const cur = currency || 'EUR';
  const fmt = (v) => formatCurrency(Number(v) || 0, cur);

  const showOriginal = originalPrice !== null && originalPrice !== undefined;
  const showCurrent = currentPrice !== null && currentPrice !== undefined;
  const showDiscount = discountAmount !== null && discountAmount !== undefined;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 mb-3">
      {showOriginal && (
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Original</span>
          <span className={`tabular-nums ${showCurrent ? 'text-slate-500 line-through' : 'font-medium text-slate-700'}`}>
            {fmt(originalPrice)}
          </span>
        </div>
      )}
      {showCurrent && (
        <div className="flex justify-between text-xs mt-1">
          <span className="text-slate-500">Current</span>
          <span className="tabular-nums font-medium text-slate-700">{fmt(currentPrice)}</span>
        </div>
      )}
      {showDiscount && (
        <div className="flex justify-between text-xs mt-1">
          <span className="text-slate-500">Discount</span>
          <span className="tabular-nums font-medium text-rose-600">−{fmt(discountAmount)}</span>
        </div>
      )}
      <div className="flex justify-between text-sm mt-1.5 pt-1.5 border-t border-slate-200">
        <span className="font-semibold text-slate-700">{finalLabel}</span>
        <span className="tabular-nums font-bold text-emerald-600">{fmt(finalPrice)}</span>
      </div>
      {delta !== null && delta !== 0 && (
        <div className="flex justify-between text-xs mt-1">
          <span className="text-slate-500">Delta</span>
          <span className={`tabular-nums font-medium ${delta < 0 ? 'text-rose-600' : 'text-amber-600'}`}>
            {delta < 0 ? '−' : '+'}{fmt(Math.abs(delta))}
          </span>
        </div>
      )}
    </div>
  );
}
