// Grouped student list: card rows on mobile, a dense table-like list on desktop.
// Each row is one link (stretched over the row); the message button sits above it.
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatHours } from '../../earnings/earningsFormat';
import { cardClass } from '../../earnings/components/earningsStyles';
import { ChevronRightIcon, MessageIcon } from '../../dashboard/components/DashboardIcons';
import { useLocale } from '../../dashboard/components/lessonText';
import { formatDaysAgo, formatLessonWhen, hasPackage, remainingHours, studentFlags } from '../studentsFormat';
import { CalendarIcon } from './StudentsIcons';
import { LevelBadge, PackageRing, StudentAvatar } from './parts';

const DESKTOP_COLS = 'grid-cols-[minmax(0,2.4fr)_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.5fr)_44px]';

function NextLine({ student, flags }) {
  const { t } = useTranslation(['instructor']);
  const locale = useLocale();
  if (flags.upcoming) {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-[#00687a]">
        <CalendarIcon size={14} />
        {formatLessonWhen(student.nextLesson.date, student.nextLesson.startHour, { locale, t })}
      </span>
    );
  }
  if (student.lastLessonDate) {
    return <span>{t('instructor:students.row.lastLesson', { when: formatDaysAgo(student.lastLessonDate, locale) })}</span>;
  }
  return <span>{t('instructor:students.row.noLessons')}</span>;
}

function PackageCell({ student, flags, compact }) {
  const { t } = useTranslation(['instructor']);
  const locale = useLocale();
  if (!hasPackage(student)) {
    return compact ? null : <span className="text-sm text-slate-500">{t('instructor:students.row.noPackage')}</span>;
  }
  const left = formatHours(remainingHours(student), locale);
  const total = formatHours(student.packageHours.totalHours, locale);
  const label = t('instructor:students.row.hoursLeftOf', { left, total });
  return (
    <span className="flex items-center gap-2.5" title={label}>
      <PackageRing total={Number(student.packageHours.totalHours)} remaining={remainingHours(student)} low={flags.lowHours} size={compact ? 42 : 36}>
        {compact && <span className="text-[11px] font-bold tabular-nums text-slate-900">{left}h</span>}
      </PackageRing>
      {compact
        ? <span className="sr-only">{label}</span>
        : (
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-sm font-semibold tabular-nums text-slate-900">{t('instructor:students.row.hoursLeft', { left })}</span>
            <span className="text-xs tabular-nums text-slate-500">{t('instructor:students.row.ofTotal', { total })}</span>
          </span>
        )}
    </span>
  );
}

function LowHoursHint() {
  const { t } = useTranslation(['instructor']);
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
      {t('instructor:students.row.lowHours')}
    </span>
  );
}

function MobileRow({ student, linkState }) {
  const flags = studentFlags(student);
  return (
    <li className="relative flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 motion-safe:transition-colors">
      <StudentAvatar name={student.name} src={student.avatarUrl} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          to={`/instructor/students/${student.studentId}`}
          state={linkState}
          className="truncate text-[15px] font-semibold text-slate-900 after:absolute after:inset-0 after:content-[''] hover:text-slate-900 focus-visible:outline-none focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[#00798c]"
        >
          {student.name}
        </Link>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-600">
          <LevelBadge level={student.skillLevel} />
          <NextLine student={student} flags={flags} />
          {flags.lowHours && <LowHoursHint />}
        </div>
      </div>
      <PackageCell student={student} flags={flags} compact />
      <ChevronRightIcon size={18} className="shrink-0 text-slate-400" />
    </li>
  );
}

function DesktopRow({ student, onMessage, opening, linkState }) {
  const { t } = useTranslation(['instructor']);
  const locale = useLocale();
  const flags = studentFlags(student);
  return (
    <li className={`group relative grid ${DESKTOP_COLS} items-center gap-4 px-5 py-3 hover:bg-slate-50 motion-safe:transition-colors`}>
      <div className="flex min-w-0 items-center gap-3">
        <StudentAvatar name={student.name} src={student.avatarUrl} size="sm" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            to={`/instructor/students/${student.studentId}`}
            state={linkState}
            className="truncate text-sm font-semibold text-slate-900 after:absolute after:inset-0 after:content-[''] group-hover:text-[#00687a] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[#00798c]"
          >
            {student.name}
          </Link>
          <span className="flex items-center gap-1.5">
            <LevelBadge level={student.skillLevel} />
            {flags.lowHours && <LowHoursHint />}
          </span>
        </div>
      </div>
      <div className="text-sm text-slate-600">
        {flags.upcoming ? <NextLine student={student} flags={flags} /> : <span className="text-slate-400">—</span>}
      </div>
      <div className="text-sm text-slate-600">
        {student.lastLessonDate ? formatDaysAgo(student.lastLessonDate, locale) : <span className="text-slate-400">—</span>}
      </div>
      <div className="flex flex-col text-sm leading-tight">
        <span className="font-semibold tabular-nums text-slate-900">{t('instructor:students.row.hoursShort', { hours: formatHours(student.totalHours, locale) })}</span>
        <span className="text-xs tabular-nums text-slate-500">{t('instructor:students.row.lessons', { count: student.totalLessonCount })}</span>
      </div>
      <PackageCell student={student} flags={flags} />
      <button
        type="button"
        onClick={() => onMessage(student.studentId)}
        disabled={opening === student.studentId}
        aria-label={t('instructor:students.messageName', { name: student.name })}
        title={t('instructor:students.actions.message')}
        className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full text-slate-500 opacity-0 hover:bg-white hover:text-[#00687a] hover:shadow-sm focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] group-hover:opacity-100 disabled:opacity-50"
      >
        <MessageIcon size={18} />
      </button>
    </li>
  );
}

function GroupHeader({ groupKey, count, isDesktop }) {
  const { t } = useTranslation(['instructor']);
  if (groupKey === 'all') return null;
  return (
    <h2 className={`sticky top-0 z-[1] flex items-center gap-2 border-b border-slate-100 bg-white/95 text-xs font-bold uppercase tracking-wide text-slate-500 backdrop-blur ${isDesktop ? 'px-5 py-2' : 'px-4 py-2'}`}>
      {t(`instructor:students.groups.${groupKey}`)}
      <span className="font-semibold tabular-nums text-slate-400">{count}</span>
    </h2>
  );
}

function DesktopHeader({ sort, onSortChange }) {
  const { t } = useTranslation(['instructor']);
  const col = (label, key) => (key
    ? (
      <button
        type="button"
        onClick={() => onSortChange(key)}
        aria-pressed={sort === key}
        className={`text-left uppercase tracking-wide hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] ${sort === key ? 'text-slate-900' : ''}`}
      >
        {label}{sort === key ? ' ↓' : ''}
      </button>
    )
    : <span className="uppercase tracking-wide">{label}</span>);
  return (
    <div className={`grid ${DESKTOP_COLS} gap-4 border-b border-slate-200 bg-slate-50/80 px-5 py-2.5 text-xs font-semibold text-slate-500`}>
      {col(t('instructor:students.columns.student'), 'name')}
      {col(t('instructor:students.columns.next'), 'next')}
      {col(t('instructor:students.columns.last'), 'recent')}
      {col(t('instructor:students.columns.taught'), 'hours')}
      {col(t('instructor:students.columns.package'))}
      <span />
    </div>
  );
}

export default function StudentList({ groups, isDesktop, sort, onSortChange, onMessage, opening, linkState }) {
  return (
    <section className={`${cardClass} overflow-clip`} data-testid="students-list">
      {isDesktop && <DesktopHeader sort={sort} onSortChange={onSortChange} />}
      {groups.map((group) => (
        <div key={group.key}>
          <GroupHeader groupKey={group.key} count={group.items.length} isDesktop={isDesktop} />
          <ul className="divide-y divide-slate-100">
            {group.items.map((s) => (isDesktop
              ? <DesktopRow key={s.studentId} student={s} onMessage={onMessage} opening={opening} linkState={linkState} />
              : <MobileRow key={s.studentId} student={s} linkState={linkState} />))}
          </ul>
        </div>
      ))}
    </section>
  );
}
