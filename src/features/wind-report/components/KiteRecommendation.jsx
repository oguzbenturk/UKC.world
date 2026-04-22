import React from 'react';
import { useTranslation } from 'react-i18next';
import { calcKiteSize, MIN_KITE_SQM, MAX_KITE_SQM } from '../utils/kiteSize';

const KiteRecommendation = ({ weight, windKn, timeLabel }) => {
  const { t } = useTranslation('common');

  const [prev, setPrev] = React.useState(null);
  const recommended = calcKiteSize(weight, windKn);
  const rangeLow = recommended != null ? Math.max(MIN_KITE_SQM, recommended - 1) : null;
  const rangeHigh = recommended != null ? Math.min(MAX_KITE_SQM, recommended + 1) : null;

  const [pulse, setPulse] = React.useState(false);
  React.useEffect(() => {
    if (recommended == null) return;
    if (prev != null && prev !== recommended) {
      setPulse(true);
      const id = setTimeout(() => setPulse(false), 260);
      return () => clearTimeout(id);
    }
    setPrev(recommended);
    return undefined;
  }, [recommended, prev]);

  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-gotham-medium uppercase tracking-[0.3em] text-slate-400">
          {t('windReport.kiteSizer.recommended')}
        </span>
        {timeLabel && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-gotham-medium uppercase tracking-[0.2em] text-white/80 tabular-nums">
            <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-[#00a8c4]" />
            {timeLabel}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={`font-duotone-bold-extended text-[56px] leading-none text-white tabular-nums transition-transform duration-200 ${
            pulse ? 'scale-[1.08]' : 'scale-100'
          }`}
        >
          {recommended ?? '—'}
        </span>
        <span className="font-duotone-bold text-sm text-slate-400">m²</span>
      </div>
      {rangeLow != null && (
        <div className="mt-0.5 text-[10px] font-gotham-medium text-slate-500 tabular-nums">
          {rangeLow}–{rangeHigh} m² · {weight}kg @ {windKn}kn
        </div>
      )}
      <div
        className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5"
        title={t('windReport.kiteSizer.info')}
      >
        <span className="inline-block h-1 w-1 rounded-full bg-emerald-400" />
        <span className="text-[8.5px] font-gotham-medium uppercase tracking-[0.25em] text-slate-300">
          {t('windReport.kiteSizer.brand')}
        </span>
      </div>
    </div>
  );
};

export default KiteRecommendation;
