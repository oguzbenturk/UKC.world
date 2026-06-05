import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowUpRightIcon } from '@heroicons/react/24/outline';
import { useUkcLive } from '../hooks/useUkcLive';

/**
 * Wind-state → palette (legacy UKC badge thresholds: aqua / green / yellow / red).
 * Number shades are -600/slate-500 so the large hero number clears WCAG AA (≥3:1 on
 * white); the lighter -50/-700 pair is kept for the small state chip.
 */
const STATE_STYLES = {
  // logo: the Windguru mark recolours by wind strength (kit's badge behaviour).
  // calm uses the visible pale-cyan "sky" variant instead of the grey default,
  // which would vanish on this light card.
  calm:    { num: 'text-slate-500',   chip: 'bg-slate-100 text-slate-600',     glow: 'bg-slate-300',   logo: '/Images/windguru/wglogo-sky.png' },
  light:   { num: 'text-sky-600',     chip: 'bg-sky-50 text-sky-700',          glow: 'bg-sky-300',     logo: '/Images/windguru/wglogo-aqua.png' },
  good:    { num: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-700',  glow: 'bg-emerald-300', logo: '/Images/windguru/wglogo-grass.png' },
  strong:  { num: 'text-amber-600',   chip: 'bg-amber-50 text-amber-700',      glow: 'bg-amber-300',   logo: '/Images/windguru/wglogo-sun.png' },
  extreme: { num: 'text-rose-600',    chip: 'bg-rose-50 text-rose-700',        glow: 'bg-rose-300',    logo: '/Images/windguru/wglogo-mars.png' },
  unknown: { num: 'text-slate-500',   chip: 'bg-slate-100 text-slate-600',     glow: 'bg-slate-300',   logo: '/Images/windguru/wglogo-sky.png' },
};

const relativeUpdated = (live, t) => {
  // Prefer the absolute unixtime; the datetime string ("YYYY-MM-DD HH:MM:SS +03")
  // is sliced to the parseable local portion as a fallback only.
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
    <span className="text-[9px] font-gotham-medium uppercase tracking-[0.25em] text-slate-400">{label}</span>
    <span className="font-duotone-bold text-lg leading-tight text-slate-900">
      {value}
      {unit && <span className="ml-0.5 text-xs font-gotham-medium text-slate-400">{unit}</span>}
    </span>
  </div>
);

const Shell = ({ children }) => (
  <motion.section
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    className="relative mb-5 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_28px_-12px_rgba(15,23,42,0.10)]"
  >
    {children}
  </motion.section>
);

const LiveLabel = ({ t, logo }) => (
  <div className="mb-1 flex items-center gap-2.5">
    {logo && (
      <img
        src={logo}
        alt="Windguru"
        className="h-7 w-auto shrink-0 select-none"
        draggable={false}
        style={{ filter: 'drop-shadow(0 1px 1.5px rgba(15,23,42,0.18))' }}
      />
    )}
    <div className="flex items-center gap-2 text-[10px] font-gotham-medium uppercase tracking-[0.3em] text-slate-500">
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
      <span>{t('windReport.live.label', { defaultValue: 'Live now' })}</span>
      <span className="text-slate-300">·</span>
      <span className="text-slate-500">{t('windReport.live.station', { defaultValue: 'Urla Kite Center · Gülbahçe' })}</span>
    </div>
  </div>
);

const UkcLiveStation = () => {
  const { t } = useTranslation('common');
  const { data: live, isLoading, isError } = useUkcLive();

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center gap-5 px-6 py-5">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-[#00a8c4] border-t-transparent" />
          <div className="space-y-2">
            <div className="h-2.5 w-40 rounded bg-slate-100" />
            <div className="h-7 w-28 rounded bg-slate-100" />
          </div>
        </div>
      </Shell>
    );
  }

  // Graceful offline state — never breaks the forecast list below it.
  if (isError || !live || live.windAvgKts == null) {
    return (
      <Shell>
        <div className="px-6 py-4">
          <LiveLabel t={t} logo={STATE_STYLES.unknown.logo} />
          <p className="font-gotham-medium text-sm text-slate-400">
            {t('windReport.live.offline', { defaultValue: 'Live station offline — showing forecast below.' })}
          </p>
        </div>
      </Shell>
    );
  }

  const s = STATE_STYLES[live.state] || STATE_STYLES.unknown;
  const updated = relativeUpdated(live, t);
  const stateLabel = t(`windReport.live.states.${live.state}`, { defaultValue: '' });
  // Windguru direction is where the wind comes FROM; rotate the arrow to point where it blows TO.
  const arrowDeg = (Number(live.directionDeg) || 0) + 180;
  const kts = live.windAvgKts;

  return (
    <Shell>
      {/* breathing accent glow tinted by current state */}
      <motion.div
        aria-hidden
        className={`pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full blur-3xl ${s.glow}`}
        initial={{ opacity: 0.18, scale: 0.95 }}
        animate={{ opacity: [0.22, 0.4, 0.22], scale: [1, 1.06, 1] }}
        transition={{ duration: 9, ease: 'easeInOut', repeat: Infinity }}
      />

      <div className="relative flex flex-col gap-5 px-6 py-5 md:flex-row md:items-center md:justify-between">
        {/* Left: live label + the big number */}
        <div className="min-w-0">
          <LiveLabel t={t} logo={s.logo} />
          <div className="flex items-end gap-3">
            <div className={`font-duotone-bold-extended text-[3rem] leading-[0.85] tracking-tight sm:text-[3.75rem] md:text-[4.5rem] ${s.num}`}>
              {kts.toFixed(1)}
            </div>
            <div className="mb-1.5 flex flex-col">
              <span className="font-duotone-bold text-base text-slate-500">{t('windReport.unit.knots', { defaultValue: 'kt' })}</span>
              {stateLabel && (
                <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-gotham-medium uppercase tracking-[0.2em] ${s.chip}`}>
                  {stateLabel}
                </span>
              )}
            </div>
          </div>
          {updated && (
            <p className="mt-2 text-[10px] font-gotham-medium uppercase tracking-[0.25em] text-slate-400">
              {t('windReport.live.updated', { time: updated, defaultValue: `Updated ${updated}` })}
            </p>
          )}
        </div>

        {/* Right: gust / lull / direction / temp */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 sm:gap-x-7">
          {live.windMaxKts != null && (
            <Metric label={t('windReport.live.gust', { defaultValue: 'Gust' })} value={live.windMaxKts.toFixed(1)} unit={t('windReport.unit.knots', { defaultValue: 'kt' })} />
          )}
          {live.windMinKts != null && (
            <Metric label={t('windReport.live.lull', { defaultValue: 'Lull' })} value={live.windMinKts.toFixed(1)} unit={t('windReport.unit.knots', { defaultValue: 'kt' })} />
          )}

          {live.directionDeg != null && (
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-gotham-medium uppercase tracking-[0.25em] text-slate-400">
                {t('windReport.live.dir', { defaultValue: 'Direction' })}
              </span>
              <div className="mt-1 flex items-center gap-1.5">
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-slate-200"
                  style={{ transform: `rotate(${arrowDeg}deg)` }}
                  aria-hidden
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-[#00a8c4]">
                    <path d="M12 3l6 14-6-3.5L6 17l6-14z" fill="currentColor" />
                  </svg>
                </span>
                <span className="font-duotone-bold text-sm text-slate-900">{live.directionText || `${Math.round(live.directionDeg)}°`}</span>
              </div>
            </div>
          )}

          {live.temperatureC != null && (
            <Metric label={t('windReport.live.temp', { defaultValue: 'Temp' })} value={`${live.temperatureC.toFixed(0)}°`} />
          )}
        </div>
      </div>

      {/* Footer: attribution + station link */}
      <div className="flex items-center justify-between border-t border-slate-100 bg-white px-6 py-2 text-[9px] font-gotham-medium uppercase tracking-[0.25em] text-slate-400">
        <span>{t('windReport.sources.servedBy', { defaultValue: 'via Windguru' })}</span>
        <a
          href={`https://www.windguru.cz/station/${live.stationId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 transition hover:text-slate-700"
        >
          <span>{t('windReport.live.viaStation', { id: live.stationId, defaultValue: `UKC station #${live.stationId}` })}</span>
          <ArrowUpRightIcon className="h-3 w-3" />
        </a>
      </div>
    </Shell>
  );
};

export default UkcLiveStation;
