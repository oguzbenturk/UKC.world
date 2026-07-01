import React from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { getWindBand } from '../utils/windBands';
import { WR_DOT } from '../utils/bandTheme';
import { hhmm } from '../utils/verdict';
import { DataLabel } from './Typo';

// Tap-detail strip — the home for exact per-hour numbers (gust, temp, cloud, humidity)
// now that the timeline is a curve. Sits between the curve and the footer.
const HourDetail = ({ hour }) => {
  const { t } = useTranslation('common');
  const reduce = useReducedMotion();

  if (!hour) {
    return (
      <div className="flex items-center justify-center border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-center">
        <DataLabel className="italic text-slate-500">{t('windReport.clickHint')}</DataLabel>
      </div>
    );
  }

  const band = getWindBand(hour.wspdKn);
  const dotClass = WR_DOT[band] || WR_DOT.flat;

  const timeStr = hhmm(hour.hour);
  const cloudAvg = hour.cloudHighPct != null
    ? Math.round(((hour.cloudHighPct || 0) + (hour.cloudMidPct || 0) + (hour.cloudLowPct || 0)) / 3)
    : null;

  const Item = ({ label, value }) => (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <DataLabel>{label}</DataLabel>
      <span className="font-duotone-bold text-[14px] text-slate-900 tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className="relative overflow-hidden border-t border-slate-100 bg-slate-50/70">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${hour.dateLocal}:${hour.hour}`}
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
          transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5"
        >
          <div className="flex items-center gap-2 border-r border-slate-200 pr-3">
            <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
            <span className="font-duotone-bold-extended text-[16px] text-slate-900 tabular-nums leading-none">
              {timeStr}
            </span>
          </div>
          <Item label={t('windReport.metrics.wind')} value={`${hour.wspdKn ?? '—'} kn`} />
          <Item label={t('windReport.metrics.direction')} value={`${hour.dirText ?? '—'}${hour.dirDeg != null ? ` ${hour.dirDeg}°` : ''}`} />
          <Item label={t('windReport.metrics.gusts')} value={`${hour.gustKn ?? '—'} kn`} />
          <Item label={t('windReport.metrics.temp')} value={hour.tempC != null ? `${hour.tempC}°C` : '—'} />
          {cloudAvg != null && <Item label={t('windReport.metrics.clouds')} value={`${cloudAvg}%`} />}
          {hour.humidityPct != null && <Item label={t('windReport.detail.humidity')} value={`${hour.humidityPct}%`} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default HourDetail;
