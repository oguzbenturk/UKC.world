import { useTranslation } from 'react-i18next';

const PERIODS = ['week', 'month', 'year', 'all'];

// Segmented Week / Month / Year / All control (each segment ≥ 40px tall).
export default function PeriodSwitch({ value, onChange, className = '' }) {
  const { t } = useTranslation(['instructor']);
  const labels = {
    week: t('instructor:earnings.period.week'),
    month: t('instructor:earnings.period.month'),
    year: t('instructor:earnings.period.year'),
    all: t('instructor:earnings.period.all'),
  };

  return (
    <div
      role="group"
      aria-label={t('instructor:earnings.period.label')}
      className={`grid grid-cols-4 gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1 ${className}`}
    >
      {PERIODS.map((key) => {
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => !active && onChange(key)}
            className={[
              'h-10 min-w-0 rounded-xl px-1 text-sm whitespace-nowrap sm:px-3',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]',
              active ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'font-medium text-slate-600 hover:text-slate-900',
            ].join(' ')}
          >
            {labels[key]}
          </button>
        );
      })}
    </div>
  );
}
