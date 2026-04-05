/**
 * DualPrice — shows the EUR base price with the user's local currency equivalent.
 *
 * Usage:
 *   <DualPrice eurPrice={650} />                → "€650.00 (~₺33,143.44)"
 *   <DualPrice eurPrice={650} size="lg" />      → larger variant
 *   <DualPrice eurPrice={650} layout="stack" /> → stacked (EUR on top, local below)
 *
 * When the user's currency IS EUR, only the EUR price is rendered (no duplicate).
 */
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const DualPrice = ({ eurPrice, size = 'md', layout = 'inline', className = '' }) => {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();

  const amount = Number(eurPrice) || 0;
  const eurFormatted = formatCurrency(amount, 'EUR');

  // If user is already on EUR, just show the EUR price
  if (!userCurrency || userCurrency === 'EUR') {
    return <span className={className}>{eurFormatted}</span>;
  }

  const converted = convertCurrency(amount, 'EUR', userCurrency);
  const localFormatted = formatCurrency(converted, userCurrency);

  const sizeClasses = {
    sm: { primary: 'text-sm font-semibold', secondary: 'text-[10px]' },
    md: { primary: 'text-base font-bold', secondary: 'text-xs' },
    lg: { primary: 'text-2xl font-bold', secondary: 'text-sm' },
    xl: { primary: 'text-3xl font-bold', secondary: 'text-base' },
  };
  const s = sizeClasses[size] || sizeClasses.md;

  if (layout === 'stack') {
    return (
      <span className={`inline-flex flex-col ${className}`}>
        <span className={s.primary}>{eurFormatted}</span>
        <span className={`${s.secondary} opacity-60`}>~{localFormatted}</span>
      </span>
    );
  }

  // inline (default)
  return (
    <span className={className}>
      <span className={s.primary}>{eurFormatted}</span>
      <span className={`${s.secondary} opacity-60 ml-1`}>(~{localFormatted})</span>
    </span>
  );
};

export default DualPrice;
