import React from 'react';
import { useTranslation } from 'react-i18next';
import { getWindBand } from '../utils/windBands';

// Dark ribbon variant — sits between the timeline and the footer,
// mirrors the hero band to bookend the card.
const HourDetail = ({ hour }) => {
  const { t } = useTranslation('common');

  if (!hour) {
    return (
      <div className="flex items-center justify-center bg-slate-800/95 px-4 py-2.5 text-center">
        <span className="text-[10px] font-gotham-medium italic uppercase tracking-[0.25em] text-slate-400">
          {t('windReport.clickHint')}
        </span>
      </div>
    );
  }

  const band = getWindBand(hour.wspdKn);
  const dotClass = {
    flat: 'bg-slate-400', light: 'bg-sky-400', beginner: 'bg-emerald-400',
    ideal: 'bg-lime-400', strong: 'bg-amber-400', expert: 'bg-rose-400',
  }[band] || 'bg-slate-400';

  const hhmm = `${String(hour.hour).padStart(2, '0')}:00`;
  const cloudAvg = hour.cloudHighPct != null
    ? Math.round(((hour.cloudHighPct || 0) + (hour.cloudMidPct || 0) + (hour.cloudLowPct || 0)) / 3)
    : null;

  const Item = ({ label, value }) => (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-[9px] font-gotham-medium uppercase tracking-[0.25em] text-slate-500">
        {label}
      </span>
      <span className="font-duotone-bold text-[12px] text-white tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 bg-slate-800/95 px-4 py-2.5">
      <div className="flex items-center gap-2 border-r border-slate-700 pr-3">
        <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
        <span className="font-duotone-bold-extended text-[16px] text-white tabular-nums leading-none">
          {hhmm}
        </span>
      </div>
      <Item label={t('windReport.metrics.wind')} value={`${hour.wspdKn ?? '—'} kn`} />
      <Item label={t('windReport.metrics.direction')} value={`${hour.dirText ?? '—'}${hour.dirDeg != null ? ` ${hour.dirDeg}°` : ''}`} />
      <Item label={t('windReport.metrics.gusts')} value={`${hour.gustKn ?? '—'} kn`} />
      <Item label={t('windReport.metrics.temp')} value={hour.tempC != null ? `${hour.tempC}°C` : '—'} />
      {cloudAvg != null && <Item label={t('windReport.metrics.clouds')} value={`${cloudAvg}%`} />}
      {hour.humidityPct != null && <Item label={t('windReport.detail.humidity')} value={`${hour.humidityPct}%`} />}
    </div>
  );
};

export default HourDetail;
