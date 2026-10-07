import { useTranslation } from 'react-i18next';
import { SkeletonBlock } from '../../earnings/components/ui';
import { cardClass } from '../../earnings/components/earningsStyles';
import { formatHours, toLocalDate } from '../../earnings/earningsFormat';
import { useLocale } from './lessonText';

function DayCell({ day, isToday, isPast, locale, isDesktop }) {
  const { t } = useTranslation(['instructor']);
  const d = toLocalDate(day.date).toDate();
  const short = new Intl.DateTimeFormat(locale, { weekday: isDesktop ? 'narrow' : 'short' }).format(d);
  const long = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d);
  const off = day.off && !day.lessons;
  const label = off
    ? t('instructor:myDay.week.dayOff', { day: long })
    : t('instructor:myDay.week.dayLessons', { day: long, count: day.lessons });

  let cell = 'bg-slate-100 text-slate-900';
  if (isToday) cell = 'bg-[#00798c] text-white';
  else if (!isPast && day.lessons) cell = 'bg-cyan-50 text-slate-900';

  return (
    <li className="flex flex-col gap-1 text-center" aria-current={isToday ? 'date' : undefined}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className={`text-[11px] ${isToday ? 'font-extrabold text-[#00687a]' : 'text-slate-600'}`}>{short}</span>
      {off ? (
        <span aria-hidden="true" className="flex h-9 items-center justify-center rounded-xl border border-dashed border-slate-300 text-[11px] text-slate-600">
          {t('instructor:myDay.week.off')}
        </span>
      ) : (
        <span aria-hidden="true" className={`flex h-9 items-center justify-center rounded-xl font-extrabold tabular-nums ${cell}`}>{day.lessons}</span>
      )}
    </li>
  );
}

/** Lessons per day this week; approved time-off / non-working days show "off". */
export default function WeekStrip({ query, isDesktop }) {
  const { t } = useTranslation(['instructor']);
  const locale = useLocale();
  const week = query.data;

  const totals = week ? t('instructor:myDay.week.totals', {
    count: week.totals.lessons,
    hours: formatHours(week.totals.hours, locale),
  }) : '';

  return (
    <section aria-labelledby="my-day-week" data-testid="week-strip" className={`${cardClass} flex flex-col gap-3 ${isDesktop ? 'p-5' : 'p-4'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="my-day-week" className="text-base font-extrabold text-slate-900">{t('instructor:myDay.week.title')}</h2>
        {!isDesktop && totals && <span className="text-sm text-slate-600">{totals}</span>}
      </div>
      {week ? (
        <ol className="grid grid-cols-7 gap-1.5">
          {week.days.map((day) => (
            <DayCell
              key={day.date}
              day={day}
              isToday={day.date === week.today}
              isPast={day.date < week.today}
              locale={locale}
              isDesktop={isDesktop}
            />
          ))}
        </ol>
      ) : query.isError ? (
        <p className="text-sm text-slate-600">{t('instructor:myDay.week.error')}</p>
      ) : (
        <SkeletonBlock className="h-14" />
      )}
      {isDesktop && totals && <span className="text-sm text-slate-600">{t('instructor:myDay.week.totalsThisWeek', { totals })}</span>}
    </section>
  );
}
