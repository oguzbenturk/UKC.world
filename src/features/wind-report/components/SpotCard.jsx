import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowUpRightIcon, MapPinIcon } from '@heroicons/react/24/outline';
import DayStrip from './DayStrip';
import SessionVerdict from './SessionVerdict';
import HourDetail from './HourDetail';
import KiteRecommendation from './KiteRecommendation';
import { dailySummary, groupByDay } from '../utils/verdict';

const REGION_META = {
  izmir:     { label: 'İzmir',     accent: 'text-cyan-700',  dot: 'bg-cyan-500',  glow: 'bg-cyan-300' },
  canakkale: { label: 'Çanakkale', accent: 'text-amber-700', dot: 'bg-amber-500', glow: 'bg-amber-300' },
};

const SpotCard = ({ report, weight, index = 0 }) => {
  const { t, i18n } = useTranslation('common');
  const locale = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);

  const spot = report?.spot;
  if (!spot) return null;

  if (report.error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="font-duotone-bold text-base text-amber-800">{t(spot.nameKey)}</h3>
        <p className="mt-1 font-gotham-medium text-sm text-amber-700">{report.error}</p>
      </div>
    );
  }

  const forecast = report.forecast;
  const region = REGION_META[spot.region] || REGION_META.izmir;

  const days = React.useMemo(() => groupByDay(forecast.hours || []).slice(0, 3), [forecast]);
  const todaySummary = React.useMemo(
    () => (days[0] ? dailySummary(days[0].rows) : null),
    [days]
  );

  const defaultKey = React.useMemo(() => {
    if (!todaySummary || todaySummary.peakHour == null) return null;
    return `${days[0].dateLocal}:${todaySummary.peakHour}`;
  }, [todaySummary, days]);

  const [selectedKey, setSelectedKey] = React.useState(defaultKey);
  React.useEffect(() => { setSelectedKey(defaultKey); }, [defaultKey]);

  const selectedHour = React.useMemo(() => {
    if (!selectedKey) return null;
    for (const d of days) {
      for (const r of d.rows) {
        if (`${d.dateLocal}:${r.hour}` === selectedKey) return { ...r, dateLocal: d.dateLocal };
      }
    }
    return null;
  }, [selectedKey, days]);

  const initDate = forecast?.model?.initUtcIso ? new Date(forecast.model.initUtcIso) : null;
  const initStr = initDate
    ? `${initDate.getUTCDate()} ${initDate.toLocaleDateString(locale, { month: 'short' })} ${String(initDate.getUTCHours()).padStart(2, '0')}z`
    : '';

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: index * 0.09, ease: [0.22, 1, 0.36, 1] }}
      className="group relative overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-6px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_16px_40px_-12px_rgba(15,23,42,0.12)]"
    >
      {/* ── HERO BAND (light sky) ────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-sky-50 via-white to-sky-50/60 px-6 py-5">
        {/* Regional accent glow — soft, breathing */}
        <motion.div
          aria-hidden
          className={`pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full blur-3xl ${region.glow}`}
          initial={{ opacity: 0.2, scale: 0.9 }}
          animate={{ opacity: [0.3, 0.5, 0.3], scale: [1, 1.08, 1] }}
          transition={{ duration: 9, ease: 'easeInOut', repeat: Infinity, delay: index * 0.4 }}
        />
        {/* Bottom fade into the timeline gradient */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-slate-200/70 to-transparent" />

        <div className="relative flex items-start justify-between gap-6">
          {/* Left: region + name + verdict */}
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-gotham-medium uppercase tracking-[0.3em]">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${region.dot}`} />
              <span className={region.accent}>{region.label}</span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 text-slate-500">
                <MapPinIcon className="h-3 w-3" />
                {spot.lat.toFixed(2)}°N
              </span>
            </div>
            <h2 className="font-duotone-bold-extended text-[30px] leading-[0.95] tracking-tight text-slate-900 sm:text-[34px]">
              {t(spot.nameKey)}
            </h2>
            <div className="mt-3 max-w-md">
              <SessionVerdict summary={todaySummary} />
            </div>
          </div>

          {/* Right: kite recommendation — tracks the currently selected hour */}
          <div className="shrink-0">
            <KiteRecommendation
              weight={weight}
              windKn={selectedHour?.wspdKn ?? todaySummary?.avgKn ?? 15}
              timeLabel={
                selectedHour
                  ? `${String(selectedHour.hour).padStart(2, '0')}:00`
                  : null
              }
            />
          </div>
        </div>
      </div>

      {/* ── BODY: sky-gradient timeline ──────────────────────────── */}
      <div
        className="relative px-6 py-4"
        style={{
          background: 'linear-gradient(to right, rgb(255 241 235) 0%, rgb(224 242 254) 35%, rgb(224 242 254) 65%, rgb(255 237 213) 100%)',
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[9px] font-gotham-medium uppercase tracking-[0.3em] text-slate-500">
            {t('windReport.metrics.hourly')}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-gotham-medium uppercase tracking-[0.2em] text-amber-700 backdrop-blur-sm">
            <span className="inline-block h-1 w-3 rounded-full bg-amber-400" />
            {t('windReport.verdict.sessionWindow')}
          </span>
        </div>
        <div className="flex flex-col gap-3">
          {days.map((d) => (
            <DayStrip
              key={d.dateLocal}
              dateLocal={d.dateLocal}
              rows={d.rows}
              selectedKey={selectedKey}
              onSelectHour={(h) => setSelectedKey(`${h.dateLocal}:${h.hour}`)}
              locale={locale}
            />
          ))}
        </div>
      </div>

      {/* ── DETAIL RIBBON (dark) ─────────────────────────────────── */}
      <HourDetail hour={selectedHour} />

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-6 py-2.5 text-[9px] font-gotham-medium uppercase tracking-[0.25em] text-slate-400">
        <span>
          {t('windReport.sources.servedBy')} · {forecast?.model?.name} {forecast?.model?.resolution}
          {initStr ? ` · init ${initStr}` : ''}
        </span>
        <a
          href={`https://www.windguru.cz/${spot.windguruSpotId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 transition hover:text-slate-700"
        >
          <span>#{spot.windguruSpotId}</span>
          <ArrowUpRightIcon className="h-3 w-3" />
        </a>
      </div>
    </motion.article>
  );
};

export default SpotCard;
