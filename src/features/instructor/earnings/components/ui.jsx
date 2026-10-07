// Shared presentational primitives for the earnings page.
import { useTranslation } from 'react-i18next';
import { AlertIcon, CheckIcon, ClockIcon } from './EarningsIcons';
import { BRAND_MARK, cardClass, secondaryButtonClass } from './earningsStyles';

export const SectionTitle = ({ children, as: Tag = 'h2', className = '' }) => (
  <Tag className={`text-base font-semibold text-slate-900 ${className}`}>{children}</Tag>
);

// Status is never conveyed by color alone: each badge carries an icon + label.
export const StatusBadge = ({ status }) => {
  const { t } = useTranslation(['instructor']);
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
        <CheckIcon size={13} />
        {t('instructor:earnings.status.paid')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
      <ClockIcon size={13} />
      {t('instructor:earnings.status.pending')}
    </span>
  );
};

export const ProgressBar = ({ value, label, height = 'h-2.5' }) => (
  <div
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(value)}
    className={`${height} w-full overflow-hidden rounded-full bg-slate-200`}
  >
    <div
      className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500"
      style={{ width: `${value}%`, backgroundColor: BRAND_MARK }}
    />
  </div>
);

export const EmptyState = ({ title, hint, icon = null, className = '' }) => (
  <div className={`py-8 text-center ${className}`}>
    {icon && <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 text-[#00798c]">{icon}</div>}
    <p className="text-sm font-medium text-slate-700">{title}</p>
    {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
  </div>
);

export const ErrorState = ({ title, body, onRetry, retryLabel, className = '' }) => (
  <div role="alert" className={`${cardClass} flex flex-col items-center gap-3 px-6 py-10 text-center ${className}`}>
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-700">
      <AlertIcon size={22} />
    </span>
    <p className="text-base font-semibold text-slate-900">{title}</p>
    {body && <p className="max-w-sm text-sm text-slate-600">{body}</p>}
    {onRetry && (
      <button type="button" onClick={onRetry} className={`${secondaryButtonClass} h-11`}>
        {retryLabel}
      </button>
    )}
  </div>
);

export const SkeletonBlock = ({ className = '' }) => (
  <div aria-hidden="true" className={`rounded-xl bg-slate-200 motion-safe:animate-pulse ${className}`} />
);
