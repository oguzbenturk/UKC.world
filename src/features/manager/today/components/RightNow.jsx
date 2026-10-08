// "Right now": lessons running, instructors free, next start, plus a compact
// wind line from the same spot/threshold settings as the instructor dashboard.
import { useMemo } from 'react';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { pickWind, windVerdict } from '@/features/instructor/dashboard/dashboardFormat';

function WindLine({ windQuery, settings, spotName, date }) {
  const { t } = useTranslation(['manager']);
  const wind = useMemo(
    () => (windQuery?.data ? pickWind(windQuery.data, date || dayjs().format('YYYY-MM-DD'), dayjs().hour()) : null),
    [windQuery?.data, date],
  );
  if (!wind) {
    return windQuery?.isPending ? null : <span className="text-sm text-cyan-100">{t('manager:today.now.windUnavailable')}</span>;
  }
  const { current } = wind;
  const verdict = windVerdict(current.speedKn, settings);
  const verdictLabel = verdict ? t(`manager:today.now.wind.${verdict}`) : null;
  return (
    <div data-testid="today-wind" className="flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-3">
      <span className="flex flex-col">
        <span className="text-lg font-extrabold tabular-nums">
          {t('manager:today.now.windSpeed', { kn: current.speedKn })}
          {current.gustKn != null && <span className="ml-2 text-sm font-semibold text-cyan-100">{t('manager:today.now.gusts', { kn: current.gustKn })}</span>}
          {current.dirText && <span className="ml-1 text-sm font-semibold text-cyan-100">· {current.dirText}</span>}
        </span>
        <span className="text-xs text-cyan-100">{spotName}</span>
      </span>
      {verdictLabel && (
        <span className={`rounded-full bg-white px-3 py-1 text-xs font-extrabold ${verdict === 'good' ? 'text-emerald-800' : verdict === 'strong' ? 'text-rose-800' : 'text-slate-800'}`}>
          {verdictLabel}
        </span>
      )}
    </div>
  );
}

function Stat({ value, label, testId }) {
  return (
    <div className="flex flex-col" data-testid={testId}>
      <span className="text-2xl font-extrabold tabular-nums lg:text-3xl">{value}</span>
      <span className="text-xs text-cyan-100">{label}</span>
    </div>
  );
}

export default function RightNow({ data, windQuery, windSettings, spotName, isDesktop }) {
  const { t } = useTranslation(['manager']);
  const now = data?.now;
  if (!data?.isToday || !now) return null;
  const next = now.next;
  const nextLabel = next
    ? t('manager:today.now.nextLine', {
      time: next.startHour,
      name: next.others > 0 ? t('manager:today.plusOthers', { name: next.student, count: next.others }) : (next.student || t('manager:today.unknownStudent')),
      instructor: next.instructor?.name || t('manager:today.noInstructor'),
    })
    : t('manager:today.now.noMore');

  return (
    <section
      aria-label={t('manager:today.now.title')}
      data-testid="right-now"
      className={`flex min-w-0 flex-col gap-3.5 rounded-3xl bg-[#0b4f5c] text-white ${isDesktop ? 'p-5' : 'p-4'}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-extrabold uppercase tracking-wide text-cyan-200 tabular-nums">{t('manager:today.now.title')} · {data.nowTime}</span>
        <Link to="/calendars/lessons?view=daily" className="text-sm font-bold text-white underline underline-offset-2 hover:text-cyan-100">{t('manager:today.actions.calendar')}</Link>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat testId="now-in-lesson" value={now.inLesson} label={t('manager:today.now.inLesson')} />
        <Stat testId="now-free" value={now.freeNow.count} label={t('manager:today.now.free')} />
        {data.instructors.length > 10
          ? <Stat value={now.startingNextHour} label={t('manager:today.now.startingNextHour')} />
          : <Stat value={next?.startHour || '—'} label={t('manager:today.now.nextStart')} />}
      </div>
      {isDesktop && now.running.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {now.running.map((r) => (
            <li key={r.bookingId} className="flex justify-between gap-3 rounded-xl bg-white/10 px-3 py-2">
              <span className="truncate">● {r.others > 0 ? t('manager:today.plusOthers', { name: r.student, count: r.others }) : r.student} · {r.instructor}</span>
              <span className="shrink-0 tabular-nums text-cyan-100">{t('manager:today.now.until', { time: r.until })}</span>
            </li>
          ))}
        </ul>
      )}
      <span className="text-sm text-cyan-50">{nextLabel}</span>
      {now.freeNow.count > 0 && (
        <span className="text-sm text-cyan-50">{t('manager:today.now.freeNames', { names: now.freeNow.names.join(', ') })}</span>
      )}
      <WindLine windQuery={windQuery} settings={windSettings} spotName={spotName} date={data.date} />
    </section>
  );
}
