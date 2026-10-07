import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { formatHours, toLocalDate } from '../../earnings/earningsFormat';
import { greetingKey } from '../dashboardFormat';
import { useLocale } from './lessonText';

/** Date line, "Good morning, Mira" and "4 lessons today · 7 hours · first at 08:30". */
export default function Greeting({ name, date, summary, isDesktop, actions = null }) {
  const { t } = useTranslation(['instructor']);
  const locale = useLocale();
  const day = toLocalDate(date) || dayjs();
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric' }).format(day.toDate());
  const part = greetingKey(dayjs().hour());
  const greetings = name
    ? {
      morning: t('instructor:myDay.greeting.morning', { name }),
      afternoon: t('instructor:myDay.greeting.afternoon', { name }),
      evening: t('instructor:myDay.greeting.evening', { name }),
    }
    : {
      morning: t('instructor:myDay.greetingNoName.morning'),
      afternoon: t('instructor:myDay.greetingNoName.afternoon'),
      evening: t('instructor:myDay.greetingNoName.evening'),
    };

  let line = null;
  if (summary) {
    line = summary.lessons
      ? [
        t('instructor:myDay.summary.lessons', { count: summary.lessons }),
        t('instructor:myDay.summary.hours', { count: Number(summary.hours) || 0, hours: formatHours(summary.hours, locale) }),
        summary.firstStart ? t('instructor:myDay.summary.firstAt', { time: summary.firstStart }) : null,
      ].filter(Boolean).join(' · ')
      : t('instructor:myDay.summary.none');
  }

  return (
    <div className={`flex gap-3 ${isDesktop ? 'flex-row flex-wrap items-end justify-between' : 'flex-col px-1'}`}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-slate-600">{dateLabel}</span>
        <h1 className="font-duotone-bold-extended text-2xl tracking-tight text-slate-900 lg:text-3xl">
          {greetings[part]}
        </h1>
        {line && <span data-testid="day-summary" className="text-sm text-slate-600 lg:text-base">{line}</span>}
      </div>
      {actions}
    </div>
  );
}
