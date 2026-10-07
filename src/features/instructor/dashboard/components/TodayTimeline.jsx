import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckIcon, ClockIcon } from '../../earnings/components/EarningsIcons';
import { EmptyState } from '../../earnings/components/ui';
import { cardClass } from '../../earnings/components/earningsStyles';
import { formatHours } from '../../earnings/earningsFormat';
import { PlusIcon, WarningIcon } from './DashboardIcons';
import { useLessonTitle, useLocale } from './lessonText';

const CALENDAR_PATH = '/bookings/calendar';

// Dot shape differs per state too (filled / ring / grey), not only colour.
const DOT = {
  done: 'bg-slate-400',
  now: 'bg-[#0093ab] ring-4 ring-[#0093ab]/20',
  next: 'bg-[#0093ab] ring-4 ring-[#0093ab]/20',
  unclosed: 'border-2 border-amber-600',
  later: 'border-2 border-[#0093ab]',
};

function StateLabel({ state }) {
  const { t } = useTranslation(['instructor']);
  const map = {
    done: { icon: <CheckIcon size={13} />, label: t('instructor:myDay.state.done'), className: 'text-slate-600' },
    now: { icon: <ClockIcon size={13} />, label: t('instructor:myDay.state.now'), className: 'text-[#00687a]' },
    next: { icon: null, label: t('instructor:myDay.state.next'), className: 'text-[#00687a]' },
    unclosed: { icon: <WarningIcon size={13} />, label: t('instructor:myDay.state.unclosed'), className: 'text-amber-800' },
    later: { icon: null, label: t('instructor:myDay.state.later'), className: 'text-slate-600' },
  }[state];
  return (
    <span className={`inline-flex shrink-0 items-center justify-end gap-1 text-xs font-extrabold ${map.className}`}>
      {map.icon}
      {map.label}
    </span>
  );
}

// Text tones per state (done rows are struck through and greyed, next/now highlighted).
const TONE = {
  done: { time: 'text-slate-500', name: 'font-semibold text-slate-500 line-through', sub: 'text-slate-500', row: 'hover:bg-slate-50' },
  now: { time: 'text-[#00687a]', name: 'font-extrabold text-slate-900', sub: 'text-slate-600', row: 'bg-cyan-50' },
  next: { time: 'text-[#00687a]', name: 'font-extrabold text-slate-900', sub: 'text-slate-600', row: 'bg-cyan-50' },
  unclosed: { time: 'text-slate-900', name: 'font-bold text-slate-900', sub: 'text-slate-600', row: 'hover:bg-slate-50' },
  later: { time: 'text-slate-900', name: 'font-bold text-slate-900', sub: 'text-slate-600', row: 'hover:bg-slate-50' },
};

function WaiverFlag() {
  const { t } = useTranslation(['instructor']);
  return (
    <span className="inline-flex items-center gap-1 text-xs font-extrabold text-orange-800">
      <WarningIcon size={12} />
      {t('instructor:myDay.timeline.waiverFlag')}
    </span>
  );
}

function TimelineRow({ lesson, state, isDesktop, onOpen }) {
  const { t } = useTranslation(['instructor']);
  const locale = useLocale();
  const title = useLessonTitle(lesson);
  const tone = TONE[state] || TONE.later;
  const waiverMissing = state !== 'done' && lesson.participants.some((p) => p.waiverSigned === false);
  const service = [
    lesson.service?.name || t('instructor:myDay.lessonFallback'),
    t('instructor:myDay.durationHours', { hours: formatHours(lesson.durationHours, locale) }),
  ].join(' · ');
  const columns = isDesktop
    ? 'grid-cols-[64px_12px_minmax(0,1fr)_minmax(0,180px)_110px]'
    : 'grid-cols-[48px_12px_minmax(0,1fr)_auto]';

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(lesson)}
        data-testid={`timeline-row-${lesson.id}`}
        data-state={state}
        className={`grid min-h-[56px] w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] motion-safe:transition-colors ${columns} ${tone.row}`}
      >
        <span className={`text-sm font-extrabold tabular-nums ${tone.time}`}>{lesson.startHour}</span>
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${DOT[state]}`} />
        <span className="flex min-w-0 flex-col">
          <span className={`truncate text-[15px] ${tone.name}`}>
            {title}
            {isDesktop && waiverMissing && <span className="ml-2"><WaiverFlag /></span>}
          </span>
          {!isDesktop && (
            <span className={`flex flex-wrap items-center gap-x-2 text-[13px] ${tone.sub}`}>
              {service}
              {waiverMissing && <WaiverFlag />}
            </span>
          )}
        </span>
        {isDesktop && <span className={`truncate text-sm ${tone.sub}`}>{service}</span>}
        <StateLabel state={state} />
      </button>
    </li>
  );
}

/** Today's lessons in order; each row opens the lesson drawer. */
export default function TodayTimeline({ lessons, states, isDesktop, onOpen, onNewBooking }) {
  const { t } = useTranslation(['instructor']);
  return (
    <section
      aria-labelledby="my-day-today"
      data-testid="today-timeline"
      className={`${cardClass} flex min-w-0 flex-col gap-1 ${isDesktop ? 'p-6 lg:col-span-2' : 'p-4'}`}
    >
      <div className="flex items-center justify-between gap-2 pb-1">
        <h2 id="my-day-today" className="text-base font-extrabold text-slate-900">{t('instructor:myDay.timeline.title')}</h2>
        <div className="flex items-center gap-1">
          {!isDesktop && onNewBooking && (
            <button
              type="button"
              onClick={onNewBooking}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[#00798c] hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]"
            >
              <PlusIcon size={16} />
              {t('instructor:myDay.newBooking')}
            </button>
          )}
          <Link to={CALENDAR_PATH} className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-sm font-semibold text-[#00798c] hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]">
            {isDesktop ? t('instructor:myDay.openCalendar') : t('instructor:myDay.calendar')}
          </Link>
        </div>
      </div>
      {lessons.length ? (
        <ol className="flex flex-col divide-y divide-slate-100">
          {lessons.map((lesson) => (
            <TimelineRow key={lesson.id} lesson={lesson} state={states[lesson.id] || 'later'} isDesktop={isDesktop} onOpen={onOpen} />
          ))}
        </ol>
      ) : (
        <EmptyState title={t('instructor:myDay.timeline.empty')} hint={t('instructor:myDay.timeline.emptyHint')} />
      )}
    </section>
  );
}
