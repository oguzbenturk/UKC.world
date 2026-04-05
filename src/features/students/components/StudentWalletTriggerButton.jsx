import { WalletIcon } from '@heroicons/react/24/outline';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const variantClassMap = {
  light: 'border-white/40 bg-white/20 text-white shadow-inner hover:bg-white/30 focus-visible:ring-white/70',
  solid: 'border-slate-200 bg-white text-slate-700 shadow hover:bg-slate-50 focus-visible:ring-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  navbar: 'border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-100 focus-visible:ring-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
};

const variantBadgeClassMap = {
  light: 'bg-white/20 text-white',
  solid: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/80',
  navbar: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/80'
};

const StudentWalletTriggerButton = ({ onClick, variant = 'light', currency, balance, className = '' }) => {
  const { formatCurrency } = useCurrency();
  const classes = variantClassMap[variant] || variantClassMap.light;
  const hasNumericBalance = typeof balance === 'number' && Number.isFinite(balance);
  const formattedBalance = hasNumericBalance
    ? formatCurrency(balance, currency?.code)
    : null;
  const currencyDisplay = formattedBalance || currency?.symbol || currency?.code;
  const badgeClasses = variantBadgeClassMap[variant] || variantBadgeClassMap.light;
  const ariaLabel = currencyDisplay ? `Open wallet (${currencyDisplay})` : 'Open wallet';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-2xl border px-2.5 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent sm:px-4 sm:py-2 sm:text-sm ${classes} ${className}`}
    >
      <WalletIcon className="h-5 w-5" aria-hidden />
      <span className="text-[11px] font-semibold sm:text-sm">Wallet</span>
      {currencyDisplay ? (
        <span className={`hidden sm:inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${badgeClasses}`}>
          {currencyDisplay}
        </span>
      ) : null}
    </button>
  );
};

export default StudentWalletTriggerButton;
