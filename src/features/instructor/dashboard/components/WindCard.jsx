import { useMemo } from 'react';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckIcon } from '../../earnings/components/EarningsIcons';
import { SkeletonBlock } from '../../earnings/components/ui';
import { cardClass } from '../../earnings/components/earningsStyles';
import { isAllDayGood, pickWind, windVerdict } from '../dashboardFormat';
import { ArrowIcon, WarningIcon, WindIcon } from './DashboardIcons';

const WIND_REPORT_PATH = '/wind-report';
const linkClass = 'inline-flex min-h-[24px] items-center text-sm font-bold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded';

function Verdict({ verdict, allDay }) {
  const { t } = useTranslation(['instructor']);
  const config = {
    good: { Icon: CheckIcon, className: 'text-emerald-800', label: allDay ? t('instructor:myDay.wind.goodAllDay') : t('instructor:myDay.wind.good') },
    light: { Icon: WindIcon, className: 'text-slate-800', label: t('instructor:myDay.wind.light') },
    strong: { Icon: WarningIcon, className: 'text-rose-800', label: t('instructor:myDay.wind.strong') },
  }[verdict];
  if (!config) return null;
  const { Icon, className, label } = config;
  return (
    <span data-testid="wind-verdict" className={`inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-extrabold ${className}`}>
      <Icon size={15} />
      {label}
    </span>
  );
}

function HourBars({ bars, maxKn }) {
  const { t } = useTranslation(['instructor']);
  const top = Math.max(maxKn + 5, ...bars.map((b) => b.speedKn || 0));
  return (
    <ul aria-label={t('instructor:myDay.wind.forecastLabel')} className="grid grid-cols-6 items-end gap-1.5">
      {bars.map((bar) => {
        const ratio = bar.speedKn == null ? 0 : Math.max(bar.speedKn / top, 0.12);
        const hour = String(bar.hour).padStart(2, '0');
        return (
          <li key={bar.hour} className="flex flex-col items-center gap-1">
            <span className="sr-only">
              {bar.speedKn == null
                ? t('instructor:myDay.wind.barUnknown', { hour })
                : t('instructor:myDay.wind.barLabel', { hour, value: bar.speedKn })}
            </span>
            <span aria-hidden="true" className="text-xs font-bold tabular-nums">{bar.speedKn ?? '–'}</span>
            <div aria-hidden="true" className="flex h-14 w-full items-end">
              <div className="w-full rounded-md bg-white" style={{ height: `${Math.round(ratio * 100)}%`, opacity: 0.3 + ratio * 0.7 }} />
            </div>
            <span aria-hidden="true" className="text-[11px] text-cyan-100">{hour}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function WindUnavailable({ className = '' }) {
  const { t } = useTranslation(['instructor']);
  return (
    <section aria-label={t('instructor:myDay.wind.title')} data-testid="wind-unavailable" className={`${cardClass} flex items-center gap-3 p-4 ${className}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
        <WindIcon size={20} />
      </span>
      <p className="flex-1 text-sm font-medium text-slate-700">{t('instructor:myDay.wind.unavailable')}</p>
      <Link to={WIND_REPORT_PATH} className="inline-flex min-h-[44px] items-center rounded-lg px-1 text-sm font-semibold text-[#00798c] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]">
        {t('instructor:myDay.wind.fullReport')}
      </Link>
    </section>
  );
}

/**
 * Wind now at the configured spot + verdict + 09–19 bars. Uses the public
 * /weather/report/:spot forecast; any failure falls back to a compact
 * "unavailable" card so the rest of the page is never blocked.
 */
export default function WindCard({ query, settings, date, isDesktop, spotName }) {
  const { t } = useTranslation(['instructor']);
  const wind = useMemo(
    () => (query.data ? pickWind(query.data, date || dayjs().format('YYYY-MM-DD'), dayjs().hour()) : null),
    [query.data, date],
  );

  // Pending covers both "fetching" and "waiting for the settings" (query disabled).
  if (query.isPending && !query.isError) {
    return <SkeletonBlock className="h-56 rounded-3xl" />;
  }
  if (query.isError || !wind) return <WindUnavailable />;

  const { current, bars } = wind;
  const verdict = windVerdict(current.speedKn, settings);
  const rotation = current.dirDeg == null ? null : (current.dirDeg + 180) % 360;

  return (
    <section
      aria-label={t('instructor:myDay.wind.title')}
      data-testid="wind-card"
      className={`flex min-w-0 flex-col gap-3.5 rounded-3xl bg-gradient-to-br from-[#075e6d] to-[#0b7f92] text-white ${isDesktop ? 'p-6' : 'p-5'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-cyan-100">{t('instructor:myDay.wind.now', { spot: spotName })}</span>
          <span className="text-4xl font-extrabold leading-none tabular-nums">
            {current.speedKn} <span className="text-lg font-bold">{t('instructor:myDay.wind.unit')}</span>
          </span>
          <span className="text-sm text-cyan-50">
            {[
              current.gustKn != null ? t('instructor:myDay.wind.gusts', { value: current.gustKn }) : null,
              current.dirText ? t('instructor:myDay.wind.from', { dir: current.dirText }) : null,
            ].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className="flex flex-col items-end gap-2.5">
          {rotation != null && (
            <ArrowIcon size={44} className="motion-safe:transition-transform" style={{ transform: `rotate(${rotation}deg)` }} />
          )}
          {!isDesktop && <Verdict verdict={verdict} />}
        </div>
      </div>
      {isDesktop && <div><Verdict verdict={verdict} allDay={verdict === 'good' && isAllDayGood(bars, settings)} /></div>}
      <HourBars bars={bars} maxKn={settings.maxKn} />
      <Link to={WIND_REPORT_PATH} className={`${linkClass} self-start text-white`}>
        {t('instructor:myDay.wind.fullReport')}
      </Link>
    </section>
  );
}
