// "Instructors today": booked hours per instructor on an 08–20 track (desktop) or
// as bars (mobile). With a busy-season roster (> 10 instructors) it switches to
// "capacity by hour": how many instructors are busy in each hour.
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cardClass } from '@/features/instructor/earnings/components/earningsStyles';
import { formatHours } from '@/features/instructor/earnings/earningsFormat';
import { TIMELINE_END, TIMELINE_START, isBusySeason, trackPosition } from '../managerTodayFormat';

function useLocale() {
  const { i18n } = useTranslation();
  return i18n?.language || 'en';
}

const STATE_STYLE = {
  now: 'bg-[#00798c]',
  confirmed: 'bg-[#a5e3ec]',
  pending: 'border-2 border-dashed border-amber-500 bg-amber-50',
  done: 'bg-slate-300',
};

function Track({ lessons }) {
  const { t } = useTranslation(['manager']);
  return (
    <span className="relative block h-6 rounded-lg bg-slate-100">
      {lessons.map((l) => {
        const pos = trackPosition(l.start, l.end);
        if (!pos) return null;
        return (
          <span
            key={l.bookingId}
            title={`${l.start}–${l.end} · ${l.student || ''} · ${t(`manager:today.state.${l.state}`)}`}
            className={`absolute bottom-1 top-1 box-border rounded-md ${STATE_STYLE[l.state] || STATE_STYLE.confirmed}`}
            style={{ left: `${pos.left}%`, width: `calc(${pos.width}% - 2px)` }}
          />
        );
      })}
    </span>
  );
}

function hoursAxis() {
  const out = [];
  for (let m = TIMELINE_START; m <= TIMELINE_END; m += 120) out.push(String(m / 60).padStart(2, '0'));
  return out;
}

function DesktopRows({ instructors }) {
  const { t } = useTranslation(['manager']);
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[180px_minmax(0,1fr)_56px] items-center gap-3 text-[11px] font-semibold text-slate-500">
        <span />
        <span className="flex justify-between tabular-nums">{hoursAxis().map((h) => <span key={h}>{h}</span>)}</span>
        <span className="text-right">{t('manager:today.instructors.booked')}</span>
      </div>
      {instructors.map((i) => (
        <div key={i.id} data-testid="instructor-row" className="grid grid-cols-[180px_minmax(0,1fr)_56px] items-center gap-3">
          <span className={`truncate text-sm font-semibold ${i.off ? 'text-slate-400' : 'text-slate-900'}`}>{i.name}</span>
          {i.off
            ? <span className="text-xs text-slate-500">{t('manager:today.instructors.dayOff')}</span>
            : i.lessons.length
              ? <Track lessons={i.lessons} />
              : <span className="text-xs font-semibold text-emerald-700">{t('manager:today.instructors.freeAllDay')}</span>}
          <span className="text-right text-sm font-bold tabular-nums text-slate-900">
            {i.off ? '—' : t('manager:today.instructors.hours', { hours: formatHours(i.hours, locale) })}
          </span>
        </div>
      ))}
      <span className="text-xs text-slate-500">{t('manager:today.instructors.legend')}</span>
    </div>
  );
}

function MobileRows({ instructors }) {
  const { t } = useTranslation(['manager']);
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-2">
      {instructors.map((i) => {
        const pct = i.capacityHours > 0 ? Math.min(Math.round((i.hours / i.capacityHours) * 100), 100) : 0;
        return (
          <div key={i.id} data-testid="instructor-row" className="grid grid-cols-[84px_minmax(0,1fr)_36px] items-center gap-2">
            <span className={`truncate text-sm font-semibold ${i.off ? 'text-slate-400' : 'text-slate-900'}`}>{i.name?.split(' ')[0]}</span>
            {i.off
              ? <span className="text-xs text-slate-500">{t('manager:today.instructors.dayOff')}</span>
              : i.hours > 0
                ? (
                  <span
                    role="progressbar"
                    aria-label={t('manager:today.instructors.barLabel', { name: i.name, hours: formatHours(i.hours, locale) })}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                    className="block h-2.5 overflow-hidden rounded-full bg-slate-200"
                  >
                    <span className="block h-full rounded-full bg-[#00798c]" style={{ width: `${pct}%` }} />
                  </span>
                )
                : <span className="text-xs font-semibold text-emerald-700">{t('manager:today.instructors.freeAllDay')}</span>}
            <span className={`text-right text-xs font-bold tabular-nums ${i.hours === 0 && !i.off ? 'text-emerald-700' : 'text-slate-900'}`}>
              {i.off ? '—' : `${formatHours(i.hours, locale)}h`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CapacityByHour({ hourly, isDesktop }) {
  const { t } = useTranslation(['manager']);
  const max = Math.max(1, ...hourly.map((h) => h.total));
  return (
    <div data-testid="capacity-by-hour" className="flex flex-col gap-2">
      <ul className={`grid items-end gap-1.5 ${isDesktop ? 'h-36' : 'h-28'}`} style={{ gridTemplateColumns: `repeat(${hourly.length}, minmax(0, 1fr))` }}>
        {hourly.map((h) => {
          const full = h.total > 0 && h.busy >= h.total;
          const ratio = h.busy / max;
          return (
            <li key={h.hour} className="flex h-full flex-col justify-end">
              <span className="sr-only">{t('manager:today.instructors.hourLabel', { hour: String(h.hour).padStart(2, '0'), busy: h.busy, total: h.total })}</span>
              <span
                aria-hidden="true"
                className={`block rounded-t-md ${full ? 'bg-rose-700' : ratio > 0.75 ? 'bg-[#00798c]' : ratio > 0.4 ? 'bg-[#2a9fb1]' : 'bg-[#a5e3ec]'}`}
                style={{ height: `${Math.max(ratio * 100, 4)}%` }}
              />
            </li>
          );
        })}
      </ul>
      <div aria-hidden="true" className="grid gap-1.5 text-center text-[10px] font-semibold tabular-nums text-slate-500" style={{ gridTemplateColumns: `repeat(${hourly.length}, minmax(0, 1fr))` }}>
        {hourly.map((h) => {
          const full = h.total > 0 && h.busy >= h.total;
          return (
            <span key={h.hour} className={full ? 'text-rose-700' : ''}>
              {String(h.hour).padStart(2, '0')}<br />{full ? t('manager:today.instructors.full') : h.busy}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function InstructorsToday({ data, isDesktop }) {
  const { t } = useTranslation(['manager']);
  const locale = useLocale();
  if (!data) return null;
  const busy = isBusySeason(data);
  const { capacity } = data;
  return (
    <section aria-labelledby="instructors-today-title" data-testid="instructors-today" className={`${cardClass} flex min-w-0 flex-col gap-3 ${isDesktop ? 'p-5' : 'p-4'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="instructors-today-title" className="text-base font-bold text-slate-900">
          {busy ? t('manager:today.instructors.capacityTitle') : t('manager:today.instructors.title')}
        </h2>
        <span className="text-sm tabular-nums text-slate-600">
          {t('manager:today.instructors.capacity', {
            booked: formatHours(capacity.bookedHours, locale),
            available: formatHours(capacity.availableHours, locale),
            pct: capacity.percent,
          })}
        </span>
      </div>
      {data.instructors.length === 0 && <p className="text-sm text-slate-600">{t('manager:today.instructors.none')}</p>}
      {busy && <CapacityByHour hourly={data.hourly} isDesktop={isDesktop} />}
      {!busy && data.instructors.length > 0 && (isDesktop ? <DesktopRows instructors={data.instructors} /> : <MobileRows instructors={data.instructors} />)}
      <Link to="/calendars/lessons?view=daily" className="text-sm font-semibold text-[#00687a] hover:text-[#005f6e]">
        {t('manager:today.instructors.openTimeline')}
      </Link>
    </section>
  );
}
