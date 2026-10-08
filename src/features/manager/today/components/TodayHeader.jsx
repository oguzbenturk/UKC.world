// Date, "Good morning, Nehir", the day summary and the quick actions.
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { primaryButtonClass, secondaryButtonClass } from '@/features/instructor/earnings/components/earningsStyles';
import { formatHours, toLocalDate } from '@/features/instructor/earnings/earningsFormat';
import { BoxIcon, PlusIcon } from '@/features/instructor/dashboard/components/DashboardIcons';
import { DocumentIcon } from '@/features/instructor/earnings/components/EarningsIcons';
import { CalendarIcon } from '@/features/instructor/students/components/StudentsIcons';
import { greetingKey } from '../managerTodayFormat';

function useLocale() {
  const { i18n } = useTranslation();
  return i18n?.language || 'en';
}

function SummaryLine({ summary }) {
  const { t } = useTranslation(['manager']);
  const locale = useLocale();
  if (!summary) return null;
  const parts = [
    t('manager:today.summary.lessons', { count: summary.lessons }),
    t('manager:today.summary.instructors', { count: summary.instructorsWorking }),
    t('manager:today.summary.hours', { hours: formatHours(summary.hours, locale) }),
  ];
  if (summary.rentalsOut) parts.push(t('manager:today.summary.rentalsOut', { count: summary.rentalsOut }));
  if (summary.stayCheckIns) parts.push(t('manager:today.summary.checkIns', { count: summary.stayCheckIns }));
  return <span data-testid="today-summary" className="text-sm text-slate-600 tabular-nums lg:text-base">{parts.join(' · ')}</span>;
}

function MobileActions({ onNewBooking }) {
  const { t } = useTranslation(['manager']);
  const tile = 'flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]';
  const plain = `${tile} border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-900`;
  return (
    <div className="grid grid-cols-4 gap-2">
      <button type="button" onClick={onNewBooking} className={`${tile} bg-[#00798c] text-white hover:bg-[#006575]`}>
        <PlusIcon size={20} />
        {t('manager:today.actions.booking')}
      </button>
      <Link to="/rentals" className={plain}><BoxIcon size={20} />{t('manager:today.actions.rental')}</Link>
      <Link to="/calendars/lessons" className={plain}><CalendarIcon size={20} />{t('manager:today.actions.calendar')}</Link>
      <Link to="/proposals" className={plain}><DocumentIcon size={20} />{t('manager:today.actions.proposal')}</Link>
    </div>
  );
}

function DesktopActions({ onNewBooking }) {
  const { t } = useTranslation(['manager']);
  const link = `${secondaryButtonClass} h-11 text-sm hover:text-slate-900`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link to="/calendars/lessons" className={link}><CalendarIcon size={17} />{t('manager:today.actions.openCalendar')}</Link>
      <Link to="/rentals" className={link}><BoxIcon size={17} />{t('manager:today.actions.newRental')}</Link>
      <Link to="/proposals" className={link}><DocumentIcon size={17} />{t('manager:today.actions.newProposal')}</Link>
      <button type="button" onClick={onNewBooking} className={`${primaryButtonClass} h-11 text-sm`}>
        <PlusIcon size={17} />
        {t('manager:today.actions.newBooking')}
      </button>
    </div>
  );
}

export default function TodayHeader({ name, data, isDesktop, onNewBooking }) {
  const { t } = useTranslation(['manager']);
  const locale = useLocale();
  const day = toLocalDate(data?.date) || dayjs();
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(day.toDate());
  const part = greetingKey(dayjs().hour());
  const greeting = name ? t(`manager:today.greeting.${part}`, { name }) : t(`manager:today.greetingNoName.${part}`);

  return (
    <div className="flex flex-col gap-3.5">
      <div className={`flex gap-3 ${isDesktop ? 'flex-row flex-wrap items-end justify-between' : 'flex-col px-1'}`}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold text-slate-600">{dateLabel}</span>
          <h1 className="font-duotone-bold-extended text-2xl tracking-tight text-slate-900 lg:text-3xl">{greeting}</h1>
          <SummaryLine summary={data?.summary} />
        </div>
        {isDesktop && <DesktopActions onNewBooking={onNewBooking} />}
      </div>
      {!isDesktop && <MobileActions onNewBooking={onNewBooking} />}
    </div>
  );
}
