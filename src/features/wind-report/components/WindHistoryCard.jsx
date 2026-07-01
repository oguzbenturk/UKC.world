import React from 'react';
import { useTranslation } from 'react-i18next';
import { usePwsHistory } from '../hooks/usePwsHistory';
import { HISTORY_RANGES } from '../utils/historyConfig';
import WindHistoryChart from './WindHistoryChart';
import { Eyebrow } from './Typo';

// The full live-station history: a band-coloured wind curve over time with a range
// toggle. Recorded server-side every 5 min and never deleted; offline periods show as
// gaps. Sits under the live hero.
const WindHistoryCard = () => {
  const { t, i18n } = useTranslation('common');
  const locale = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);
  const [range, setRange] = React.useState('24h');
  const { data, isError } = usePwsHistory(range);
  const readings = data?.readings || [];
  // Drive the chart's span + "now" from the range/time the CURRENT data actually
  // represents. While a range switch is still fetching (keepPreviousData), this keeps
  // the axis and window consistent with the readings on screen instead of pairing the
  // new span with the previous range's data and a stale timestamp.
  const dataRange = data?.range || range;
  const dataNowMs = data?.fetchedAt ? Date.parse(data.fetchedAt) : undefined;

  return (
    <section className="mb-5 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_28px_-12px_rgba(15,23,42,0.10)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Eyebrow>{t('windReport.history.title', { defaultValue: 'Wind history' })}</Eyebrow>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-gotham-medium text-slate-500">
            <span className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: '#00a8c4' }} />
            {t('windReport.metrics.wind', { defaultValue: 'Wind' })}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-gotham-medium text-slate-500">
            <span className="inline-block h-0.5 w-4 rounded-full border-t border-dashed border-slate-400" />
            {t('windReport.metrics.gusts', { defaultValue: 'Gusts' })}
          </span>
        </div>
        <div className="flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5">
          {HISTORY_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`rounded-full px-2.5 py-1 text-[12px] font-gotham-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4] ${
                range === r ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t(`windReport.history.range.${r}`, { defaultValue: r })}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 pb-3 sm:px-4">
        {isError ? (
          <p className="px-2 py-10 text-center text-[13px] font-gotham-medium text-slate-400">
            {t('windReport.history.error', { defaultValue: 'History unavailable right now.' })}
          </p>
        ) : (
          <WindHistoryChart
            readings={readings}
            range={dataRange}
            variant="full"
            nowMs={dataNowMs}
            locale={locale}
            t={t}
          />
        )}
      </div>
    </section>
  );
};

export default WindHistoryCard;
