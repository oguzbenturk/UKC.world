// Contact-card style header: photo, name, level, one-tap contact actions,
// package hours ring and the four key numbers.
import { useTranslation } from 'react-i18next';
import { formatHours, toLocalDate } from '../../earnings/earningsFormat';
import { cardClass } from '../../earnings/components/earningsStyles';
import { MessageIcon } from '../../dashboard/components/DashboardIcons';
import { useLocale } from '../../dashboard/components/lessonText';
import { LOW_HOURS, formatDaysAgo, formatLessonWhen, telHref, whatsappHref } from '../studentsFormat';
import { MailIcon, PhoneIcon, WhatsAppIcon } from './StudentsIcons';
import { LevelBadge, PackageRing, StudentAvatar } from './parts';

function ContactAction({ icon, label, href, onClick, disabled, primary, isDesktop }) {
  const cls = isDesktop
    ? `inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] focus-visible:ring-offset-2 motion-safe:transition-colors ${primary ? 'bg-[#00798c] text-white shadow-sm hover:bg-[#006575] hover:text-white' : 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900'}`
    : `flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] motion-safe:transition-colors ${primary ? 'bg-[#00798c] text-white hover:bg-[#006575] hover:text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 hover:text-slate-900'}`;
  const state = disabled ? ' pointer-events-none opacity-40' : '';
  if (href) {
    return (
      <a href={disabled ? undefined : href} aria-disabled={disabled || undefined} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={cls + state}>
        {icon}
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls + (disabled ? ' opacity-50' : '')}>
      {icon}
      {label}
    </button>
  );
}

function ContactActions({ student, onMessage, messaging, isDesktop }) {
  const { t } = useTranslation(['instructor']);
  const size = isDesktop ? 17 : 20;
  const tel = telHref(student.phone);
  const wa = whatsappHref(student.phone);
  return (
    <div className={isDesktop ? 'flex flex-wrap gap-2' : 'grid grid-cols-4 gap-2'}>
      <ContactAction isDesktop={isDesktop} primary icon={<MessageIcon size={size} />} label={t('instructor:students.actions.message')} onClick={onMessage} disabled={messaging} />
      <ContactAction isDesktop={isDesktop} icon={<PhoneIcon size={size} />} label={t('instructor:students.actions.call')} href={tel || '#'} disabled={!tel} />
      <ContactAction isDesktop={isDesktop} icon={<WhatsAppIcon size={size} />} label={t('instructor:students.actions.whatsapp')} href={wa || '#'} disabled={!wa} />
      <ContactAction isDesktop={isDesktop} icon={<MailIcon size={size} />} label={t('instructor:students.actions.email')} href={student.email ? `mailto:${student.email}` : '#'} disabled={!student.email} />
    </div>
  );
}

function PackagePanel({ pkg, isDesktop }) {
  const { t } = useTranslation(['instructor']);
  const locale = useLocale();
  const total = Number(pkg?.totalHours || 0);
  const remaining = Number(pkg?.remainingHours || 0);
  if (total <= 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
        <PackageRing total={0} remaining={0} size={52} stroke={5} />
        <span className="text-sm text-slate-600">{t('instructor:students.profile.noPackage')}</span>
      </div>
    );
  }
  const low = remaining <= LOW_HOURS;
  return (
    <div className={`flex items-center gap-4 rounded-2xl px-4 py-3 ${low ? 'bg-amber-50' : 'bg-cyan-50/60'}`}>
      <PackageRing total={total} remaining={remaining} low={low} size={isDesktop ? 76 : 64} stroke={6}>
        <span className="text-base font-bold tabular-nums text-slate-900 lg:text-lg">{formatHours(remaining, locale)}</span>
        <span className="text-[10px] font-semibold uppercase text-slate-500">{t('instructor:students.profile.hoursUnit')}</span>
      </PackageRing>
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold text-slate-900">{t('instructor:students.profile.packageLeft')}</span>
        <span className="text-sm tabular-nums text-slate-600">
          {t('instructor:students.profile.packageUsed', { used: formatHours(pkg.usedHours, locale), total: formatHours(total, locale) })}
        </span>
        {low && <span className="mt-1 text-xs font-semibold text-amber-900">{t('instructor:students.profile.lowHint')}</span>}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-2xl bg-slate-50 px-3.5 py-3">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <span className={`truncate text-[15px] font-bold tabular-nums ${accent ? 'text-[#00687a]' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function Stats({ stats }) {
  const { t } = useTranslation(['instructor']);
  const locale = useLocale();
  const next = stats?.nextLesson;
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Stat
        label={t('instructor:students.profile.nextLesson')}
        value={next ? formatLessonWhen(next.date, next.startHour, { locale, t }) : t('instructor:students.profile.notBooked')}
        accent={Boolean(next)}
      />
      <Stat
        label={t('instructor:students.profile.lastLesson')}
        value={stats?.lastLessonDate ? formatDaysAgo(stats.lastLessonDate, locale) : '—'}
      />
      <Stat label={t('instructor:students.profile.lessons')} value={stats?.totalLessons ?? 0} />
      <Stat
        label={t('instructor:students.profile.hoursTaught')}
        value={t('instructor:students.row.hoursShort', { hours: formatHours(stats?.totalHours ?? 0, locale) })}
      />
    </div>
  );
}

export default function StudentHero({ profile, onMessage, messaging, isDesktop }) {
  const { t } = useTranslation(['instructor']);
  const locale = useLocale();
  const { student } = profile;
  const since = toLocalDate(student.createdAt);
  const sinceLabel = since
    ? t('instructor:students.profile.since', { date: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(since.toDate()) })
    : null;

  return (
    <section className={`${cardClass} flex flex-col gap-4 p-4 lg:gap-5 lg:p-6`} data-testid="student-hero">
      <div className={`flex gap-4 ${isDesktop ? 'items-center justify-between' : 'flex-col'}`}>
        <div className="flex min-w-0 items-center gap-4">
          <StudentAvatar name={student.name} src={student.avatarUrl} size="lg" />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-duotone-bold-extended text-xl leading-tight tracking-tight text-slate-900 lg:text-3xl">{student.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <LevelBadge level={student.level} />
              {sinceLabel && <span>{sinceLabel}</span>}
            </div>
            {isDesktop && (student.phone || student.email) && (
              <span className="truncate text-sm text-slate-500">{[student.phone, student.email].filter(Boolean).join(' · ')}</span>
            )}
          </div>
        </div>
        {isDesktop && <div className="w-[340px] shrink-0"><PackagePanel pkg={profile.packageHours} isDesktop /></div>}
      </div>
      <ContactActions student={student} onMessage={onMessage} messaging={messaging} isDesktop={isDesktop} />
      {!isDesktop && <PackagePanel pkg={profile.packageHours} isDesktop={false} />}
      <Stats stats={profile.stats} />
    </section>
  );
}
