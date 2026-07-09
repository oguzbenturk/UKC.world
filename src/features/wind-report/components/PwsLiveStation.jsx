import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { Disclosure } from '@headlessui/react';
import { ArrowUpRightIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { usePwsLive } from '../hooks/usePwsLive';
import { usePwsHistory } from '../hooks/usePwsHistory';
import WindHistoryChart from './WindHistoryChart';
import { calcKiteSize } from '../utils/kiteSize';
import { stateBand, WR_TEXT, WR_DOT, WR_CHIP, WR_HEX, BRAND_CYAN } from '../utils/bandTheme';
import { GUST_FACTOR_THRESHOLD } from '../utils/verdict';
import { Eyebrow, DataLabel } from './Typo';

const relativeUpdated = (live, t) => {
  const ms = live?.unixtime
    ? live.unixtime * 1000
    : (live?.datetime ? Date.parse(String(live.datetime).slice(0, 19).replace(' ', 'T')) : NaN);
  if (!Number.isFinite(ms)) return null;
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 1) return t('windReport.live.justNow', { defaultValue: 'just now' });
  if (mins < 60) return t('windReport.live.minsAgo', { count: mins, defaultValue: `${mins} min ago` });
  const hrs = Math.round(mins / 60);
  return t('windReport.live.hrsAgo', { count: hrs, defaultValue: `${hrs} h ago` });
};

const Metric = ({ label, value, unit }) => (
  <div className="flex flex-col">
    <DataLabel>{label}</DataLabel>
    <span className="font-duotone-bold text-[18px] leading-tight text-slate-900 tabular-nums">
      {value}
      {unit && <span className="ml-0.5 text-[12px] font-gotham-medium text-slate-500">{unit}</span>}
    </span>
  </div>
);

const CompassDial = ({ deg, text }) => {
  const arrowDeg = (Number(deg) || 0) + 180; // point where the wind blows TO
  return (
    <div className="flex flex-col items-center" aria-hidden>
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="21" fill="none" stroke="#e2e8f0" strokeWidth="2" />
        <text x="24" y="9" textAnchor="middle" fontSize="7" fill="#94a3b8" fontFamily="inherit">N</text>
        <g style={{ transform: `rotate(${arrowDeg}deg)`, transformOrigin: '24px 24px' }}>
          <path d="M24 9 L29 27 L24 22 L19 27 Z" fill={BRAND_CYAN} />
        </g>
      </svg>
      {text && <span className="mt-0.5 font-duotone-bold text-[13px] leading-none text-slate-900">{text}</span>}
    </div>
  );
};

const Shell = ({ children }) => {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative mb-5 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_28px_-12px_rgba(15,23,42,0.10)]"
    >
      {children}
    </motion.section>
  );
};

const LiveLabel = ({ t }) => (
  <div className="mb-1 flex items-center gap-2">
    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 motion-reduce:animate-none" />
    <Eyebrow>{t('windReport.live.label', { defaultValue: 'Live now' })}</Eyebrow>
    <span className="text-slate-300">·</span>
    <Eyebrow className="normal-case tracking-normal text-slate-500">
      {t('windReport.live.station', { defaultValue: 'Urla Kite Center · Gülbahçe' })}
    </Eyebrow>
  </div>
);

const PwsLiveStation = ({ weight }) => {
  const { t } = useTranslation('common');
  const reduce = useReducedMotion();
  const { data: live, isLoading, isError } = usePwsLive();
  const { data: history } = usePwsHistory('1h');

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center gap-5 px-6 py-5">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-[#00a8c4] border-t-transparent motion-reduce:animate-none" />
          <div className="space-y-2">
            <div className="h-2.5 w-40 rounded bg-slate-100" />
            <div className="h-7 w-28 rounded bg-slate-100" />
          </div>
        </div>
      </Shell>
    );
  }

  if (isError || !live || live.windAvgKts == null) {
    return (
      <Shell>
        <div className="px-6 py-4" aria-live="polite">
          <LiveLabel t={t} />
          <p className="font-gotham-medium text-[15px] text-slate-500">
            {t('windReport.live.offline', { defaultValue: 'Live station offline — showing forecast below.' })}
          </p>
        </div>
      </Shell>
    );
  }

  const band = stateBand(live.state);
  const updated = relativeUpdated(live, t);
  const stateLabel = t(`windReport.live.states.${live.state}`, { defaultValue: '' });
  const verdict = t(`windReport.live.verdict.${live.state}`, { defaultValue: stateLabel });
  const kts = live.windAvgKts;
  const kt = t('windReport.unit.knots', { defaultValue: 'kt' });
  const kite = calcKiteSize(weight, kts);

  const gustFactor = live.windGustKts && kts ? live.windGustKts / kts : 0;
  const isGusty = gustFactor > GUST_FACTOR_THRESHOLD;

  return (
    <Shell>
      {/* breathing accent glow tinted by current state — gated by reduced-motion */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full blur-3xl"
          style={{ backgroundColor: WR_HEX[band], opacity: 0.18 }}
          animate={{ opacity: [0.16, 0.32, 0.16], scale: [1, 1.06, 1] }}
          transition={{ duration: 9, ease: 'easeInOut', repeat: Infinity }}
        />
      )}

      <div className="relative flex flex-col gap-5 px-6 py-5 md:flex-row md:items-center md:justify-between">
        {/* Left: verdict + the big number + kite */}
        <div className="min-w-0" aria-live="polite" aria-atomic="true">
          <LiveLabel t={t} />

          {/* plain-language go/no-go verdict — the dominant element */}
          <p className={`font-duotone-bold leading-[0.98] tracking-normal ${WR_TEXT[band]} text-[30px] sm:text-[36px]`}>
            {verdict}
          </p>

          <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
            <div className="flex items-end gap-3">
              <div className={`font-duotone-bold-extended text-[3rem] leading-[0.85] tracking-normal tabular-nums sm:text-[3.75rem] ${WR_TEXT[band]}`}>
                {kts.toFixed(1)}
              </div>
              <span className="mb-1.5 font-duotone-bold text-[16px] text-slate-500">{kt}</span>
            </div>

            {live.directionDeg != null && (
              <CompassDial deg={live.directionDeg} text={live.directionText || `${Math.round(live.directionDeg)}°`} />
            )}

            {kite != null && (
              <div className="mb-1 flex flex-col">
                <DataLabel>{t('windReport.kiteSizer.recommended', { defaultValue: 'Recommended' })}</DataLabel>
                <span className="font-duotone-bold-extended text-[28px] leading-none text-slate-900 tabular-nums">
                  {t('windReport.live.rigNow', { size: kite, defaultValue: `${kite} m²` })}
                </span>
              </div>
            )}
          </div>

          {/* gusty warning — only when it matters */}
          {isGusty && (
            <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-duotone-bold ${WR_CHIP.strong}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${WR_DOT.strong}`} />
              {t('windReport.live.gusty', { gust: live.windGustKts?.toFixed(0), defaultValue: `Gusty (gust ${live.windGustKts?.toFixed(0)})` })}
            </span>
          )}

          {updated && (
            <DataLabel className="mt-3 block text-slate-500">
              {t('windReport.live.updated', { time: updated, defaultValue: `Updated ${updated}` })}
            </DataLabel>
          )}
        </div>

        {/* Right: primary conditions + a "more" disclosure */}
        <div className="md:text-right">
          <div className="flex flex-wrap gap-x-6 gap-y-3 md:justify-end">
            {live.windGustKts != null && (
              <Metric label={t('windReport.live.gust', { defaultValue: 'Gust' })} value={live.windGustKts.toFixed(1)} unit={kt} />
            )}
            {live.feelsLikeC != null && (
              <Metric label={t('windReport.live.feelsLike', { defaultValue: 'Feels like' })} value={`${live.feelsLikeC.toFixed(0)}°`} />
            )}
            {live.temperatureC != null && (
              <Metric label={t('windReport.live.temp', { defaultValue: 'Temp' })} value={`${live.temperatureC.toFixed(0)}°`} />
            )}
          </div>

          <Disclosure>
            {({ open }) => (
              <div className="mt-3">
                <Disclosure.Button className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-gotham-medium text-slate-600 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4]">
                  <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                  {t('windReport.live.more', { defaultValue: 'More conditions' })}
                </Disclosure.Button>
                <Disclosure.Panel className="mt-3 flex flex-wrap gap-x-6 gap-y-3 md:justify-end">
                  {live.humidityPct != null && (
                    <Metric label={t('windReport.live.humidity', { defaultValue: 'Humidity' })} value={live.humidityPct} unit={t('windReport.unit.pct', { defaultValue: '%' })} />
                  )}
                  {live.dewpointC != null && (
                    <Metric label={t('windReport.live.dewpoint', { defaultValue: 'Dewpoint' })} value={`${live.dewpointC.toFixed(0)}°`} />
                  )}
                  {live.pressureHpa != null && (
                    <Metric label={t('windReport.live.pressure', { defaultValue: 'Pressure' })} value={live.pressureHpa} unit={t('windReport.unit.hpa', { defaultValue: 'hPa' })} />
                  )}
                  {live.precipRateMm != null && (
                    <Metric label={t('windReport.live.precipRate', { defaultValue: 'Precip rate' })} value={live.precipRateMm.toFixed(1)} unit={t('windReport.unit.mmH', { defaultValue: 'mm/h' })} />
                  )}
                  {live.precipAccumMm != null && (
                    <Metric label={t('windReport.live.precipAccum', { defaultValue: 'Precip (today)' })} value={live.precipAccumMm.toFixed(1)} unit={t('windReport.unit.mm', { defaultValue: 'mm' })} />
                  )}
                  {live.uv != null && (
                    <Metric label={t('windReport.live.uv', { defaultValue: 'UV' })} value={live.uv.toFixed(0)} />
                  )}
                </Disclosure.Panel>
              </div>
            )}
          </Disclosure>
        </div>
      </div>

      {/* 24h history sparkline — the trend behind the live number (once data exists) */}
      {history?.readings?.length > 0 && (
        <div className="border-t border-slate-100 px-6 pt-3 pb-1.5">
          <DataLabel className="mb-1 block text-slate-500">
            {t('windReport.history.recent', {
              range: t('windReport.history.range.1h', { defaultValue: '1h' }),
              defaultValue: 'Last 1h',
            })}
          </DataLabel>
          <WindHistoryChart
            readings={history.readings}
            range="1h"
            variant="spark"
            nowMs={history.fetchedAt ? Date.parse(history.fetchedAt) : undefined}
            t={t}
          />
        </div>
      )}

      {/* Footer: attribution + station link */}
      <div className="flex items-center justify-between border-t border-slate-100 bg-white px-6 py-2.5">
        <DataLabel className="text-slate-500">{t('windReport.sources.servedByPws', { defaultValue: 'via Weather Underground' })}</DataLabel>
        <a
          href={`https://www.wunderground.com/dashboard/pws/${live.stationId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4] rounded"
        >
          <DataLabel className="text-inherit">{t('windReport.live.viaStationPws', { id: live.stationId, defaultValue: `UKC station ${live.stationId}` })}</DataLabel>
          <ArrowUpRightIcon className="h-3.5 w-3.5" />
        </a>
      </div>
    </Shell>
  );
};

export default PwsLiveStation;
