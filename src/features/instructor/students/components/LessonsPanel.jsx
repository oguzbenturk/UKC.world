// Lessons with this student: coming up first, then the most recent ones.
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { AlertIcon, CheckIcon, ClockIcon } from '../../earnings/components/EarningsIcons';
import { cardClass } from '../../earnings/components/earningsStyles';
import { formatHours, formatStartHour, toLocalDate } from '../../earnings/earningsFormat';
import { useLocale } from '../../dashboard/components/lessonText';
import { lessonKind } from '../studentsFormat';
import { CloseIcon } from './StudentsIcons';

const KIND_STYLE = {
  completed: { cls: 'bg-emerald-50 text-emerald-800', icon: <CheckIcon size={12} /> },
  booked: { cls: 'bg-cyan-50 text-[#00687a]', icon: <ClockIcon size={12} /> },
  cancelled: { cls: 'bg-slate-100 text-slate-600', icon: <CloseIcon size={12} /> },
  noShow: { cls: 'bg-rose-50 text-rose-800', icon: <AlertIcon size={12} /> },
};

function LessonRow({ lesson, upcoming }) {
  const { t } = useTranslation(['instructor']);
  const locale = useLocale();
  const d = toLocalDate(lesson.date || lesson.startTime);
  const kind = lessonKind(lesson.status);
  const style = KIND_STYLE[kind];
  const time = formatStartHour(lesson.startHour);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${upcoming ? 'bg-[#00798c] text-white' : 'bg-slate-100 text-slate-700'}`}>
        <span className="text-[10px] font-bold uppercase leading-none">{d ? new Intl.DateTimeFormat(locale, { month: 'short' }).format(d.toDate()) : ''}</span>
        <span className="text-lg font-bold leading-tight tabular-nums">{d ? d.date() : '–'}</span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-sm font-semibold ${kind === 'cancelled' ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
          {lesson.serviceName || t('instructor:students.lessons.fallback')}
        </span>
        <span className="text-xs tabular-nums text-slate-500">
          {[d ? new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d.toDate()) : null, time, t('instructor:students.row.hoursShort', { hours: formatHours(lesson.durationHours, locale) })].filter(Boolean).join(' · ')}
        </span>
      </div>
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${style.cls}`}>
        {style.icon}
        {t(`instructor:students.lessons.status.${kind}`)}
      </span>
    </li>
  );
}

export default function LessonsPanel({ lessons = [] }) {
  const { t } = useTranslation(['instructor']);
  const today = dayjs().format('YYYY-MM-DD');
  const isUpcoming = (l) => (l.date || '') >= today && lessonKind(l.status) === 'booked';
  const upcoming = lessons.filter(isUpcoming).sort((a, b) => `${a.date}${a.startHour}`.localeCompare(`${b.date}${b.startHour}`));
  const past = lessons.filter((l) => !isUpcoming(l));

  return (
    <section className={`${cardClass} flex flex-col gap-2 p-4 lg:p-5`} aria-labelledby="lessons-title" data-testid="lessons-panel">
      <h2 id="lessons-title" className="text-base font-semibold text-slate-900">{t('instructor:students.lessons.title')}</h2>
      {lessons.length === 0 && <p className="py-6 text-center text-sm text-slate-600">{t('instructor:students.lessons.empty')}</p>}
      {upcoming.length > 0 && (
        <div>
          <h3 className="pt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{t('instructor:students.lessons.upcoming')}</h3>
          <ul className="divide-y divide-slate-100">{upcoming.map((l) => <LessonRow key={l.id} lesson={l} upcoming />)}</ul>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <h3 className="pt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{t('instructor:students.lessons.past')}</h3>
          <ul className="divide-y divide-slate-100">{past.map((l) => <LessonRow key={l.id} lesson={l} />)}</ul>
        </div>
      )}
    </section>
  );
}
