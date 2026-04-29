/**
 * DualPrice — shows the EUR base price together with the user's local currency.
 *
 * Usage:
 *   <DualPrice eurPrice={650} />                → "650€ / 21,125 ₺"
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
        <span className={`${s.secondary} opacity-60`}>{localFormatted}</span>
      </span>
    );
  }

  return (
    <span className={className}>
      <span className={s.primary}>{eurFormatted}</span>
      <span className={`${s.secondary} opacity-60 ml-1`}>/ {localFormatted}</span>
    </span>
  );
};

export default DualPrice;
