import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckIcon } from '../../earnings/components/EarningsIcons';
import { cardClass, primaryButtonClass, secondaryButtonClass } from '../../earnings/components/earningsStyles';
import { isCheckedIn, lessonEnd, minutesUntil } from '../dashboardFormat';
import { Avatar, EquipmentChip, LastNote, LevelChip, WaiverChip } from './lessonParts';
import { useLessonSubtitle, useLessonTitle } from './lessonText';
import { MessageIcon, NoteIcon } from './DashboardIcons';

const CALENDAR_PATH = '/bookings/calendar';

function useWhen(lesson, date) {
  const { t } = useTranslation(['instructor']);
  if (!lesson) return '';
  if (isCheckedIn(lesson)) return t('instructor:myDay.next.inProgress');
  const minutes = minutesUntil(date, lesson.startHour);
  if (minutes == null) return '';
  if (minutes <= 0) return t('instructor:myDay.next.startingNow');
  if (minutes < 60) return t('instructor:myDay.next.inMinutes', { minutes });
  return t('instructor:myDay.next.inHours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

/** Group-aware facts for the chips: distinct levels, combined waiver state. */
function summarize(lesson) {
  const participants = lesson.participants || [];
  const waivers = participants.map((p) => p.waiverSigned);
  let waiver = null;
  if (waivers.includes(false)) waiver = false;
  else if (waivers.length && waivers.every((v) => v === true)) waiver = true;
  return {
    single: participants.length === 1 ? participants[0] : null,
    levels: [...new Set(participants.map((p) => p.skillLevel).filter(Boolean))],
    waiver,
    initials: participants[0]?.initials || '',
  };
}

function EmptyNext({ hadLessons, isDesktop }) {
  const { t } = useTranslation(['instructor']);
  return (
    <section
      aria-label={t('instructor:myDay.next.title')}
      data-testid="next-lesson-empty"
      className={`${cardClass} flex flex-col items-start gap-2 ${isDesktop ? 'p-6 lg:col-span-2' : 'p-5'}`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <CheckIcon size={20} />
      </span>
      <p className="text-base font-semibold text-slate-900">
        {hadLessons ? t('instructor:myDay.next.noneLeft') : t('instructor:myDay.next.noneToday')}
      </p>
      <p className="text-sm text-slate-600">{t('instructor:myDay.next.noneHint')}</p>
      <Link to={CALENDAR_PATH} className="inline-flex min-h-[44px] items-center rounded-lg text-sm font-semibold text-[#00798c] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]">
        {t('instructor:myDay.openCalendar')}
      </Link>
    </section>
  );
}

function HeroActions({ lesson, single, isDesktop, busy, openingChat, canClose, onCheckIn, onCheckOut, onOpen, onMessage }) {
  const { t } = useTranslation(['instructor']);
  const checkedIn = isCheckedIn(lesson);
  const primaryLabel = checkedIn ? t('instructor:myDay.actions.checkOut') : t('instructor:myDay.actions.checkIn');
  const primaryClass = `${primaryButtonClass} h-12 text-base ${isDesktop ? 'px-7' : ''}`;
  // Instructors check a lesson in but never close it — the manager checks it out
  // after it ends (owner decision 2026-10-08). Staff keep the Check out button.
  const closedByManager = checkedIn && !canClose;
  return (
    <div className={isDesktop ? 'flex flex-wrap gap-2.5' : 'grid grid-cols-[2fr_1fr_1fr] gap-2'}>
      {closedByManager ? (
        <p data-testid="close-hint" className={`flex min-h-[48px] items-center rounded-lg bg-slate-50 px-3 text-sm font-medium text-slate-700 ${isDesktop ? 'px-4' : ''}`}>
          {t('instructor:myDay.closeHint')}
        </p>
      ) : (
        <button type="button" onClick={() => (checkedIn ? onCheckOut(lesson) : onCheckIn(lesson))} disabled={busy} className={primaryClass}>
          {busy ? t('instructor:myDay.actions.saving') : primaryLabel}
        </button>
      )}
      <button type="button" onClick={() => onOpen(lesson, { note: true })} className={`${secondaryButtonClass} h-12 text-sm`}>
        {isDesktop && <NoteIcon size={18} />}
        {isDesktop ? t('instructor:myDay.actions.addNoteLong') : t('instructor:myDay.actions.notes')}
      </button>
      <button
        type="button"
        onClick={() => (single ? onMessage(single.userId) : onOpen(lesson))}
        disabled={Boolean(single) && openingChat === single.userId}
        className={`${secondaryButtonClass} h-12 text-sm`}
      >
        {isDesktop && <MessageIcon size={18} />}
        {t('instructor:myDay.actions.message')}
      </button>
    </div>
  );
}

/**
 * Hero for the next (or in-progress) lesson: who, what, level / equipment /
 * waiver, last note, and the primary actions (Check in — Check out for staff only —, Notes, Message).
 */
export default function NextLessonCard({ lesson, date, isDesktop, hadLessons, ...actions }) {
  const { t } = useTranslation(['instructor']);
  const title = useLessonTitle(lesson);
  const subtitle = useLessonSubtitle(lesson, { withPackage: isDesktop });
  const when = useWhen(lesson, date);
  if (!lesson) return <EmptyNext hadLessons={hadLessons} isDesktop={isDesktop} />;

  const { single, levels, waiver, initials } = summarize(lesson);

  return (
    <section
      aria-label={t('instructor:myDay.next.title')}
      data-testid="next-lesson"
      className={`${cardClass} flex min-w-0 flex-col gap-3.5 ${isDesktop ? 'p-6 lg:col-span-2' : 'p-5'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-extrabold uppercase tracking-wide text-[#00687a]">
          {t('instructor:myDay.next.eyebrow', { when })}
        </span>
        <span className="text-base font-extrabold tabular-nums text-slate-900">{lesson.startHour}–{lessonEnd(lesson)}</span>
      </div>

      <div className="flex items-center gap-3">
        <Avatar initials={initials} size={isDesktop ? 'lg' : 'md'} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-lg font-extrabold text-slate-900 lg:text-2xl">{title}</span>
          <span className="text-sm text-slate-600 lg:text-base">{subtitle}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {levels.length ? levels.map((level) => <LevelChip key={level} level={level} />) : <LevelChip level={null} />}
        <EquipmentChip items={lesson.equipment} />
        <WaiverChip signed={waiver} />
      </div>

      {single?.lastNote && <LastNote note={single.lastNote} />}

      <HeroActions lesson={lesson} single={single} isDesktop={isDesktop} {...actions} />
    </section>
  );
}
