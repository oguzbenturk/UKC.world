// Rentals, stays & gear, the 8-week revenue trend and the link to the full
// analytics (the old dashboard lives on as "Reports" at /admin/dashboard).
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cardClass } from '@/features/instructor/earnings/components/earningsStyles';
import { useMoney } from '@/features/instructor/earnings/earningsFormat';
import { ChevronRightIcon } from '@/features/instructor/dashboard/components/DashboardIcons';

function Row({ to, title, detail, detailClass = 'text-slate-600', right, testId }) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className="flex min-h-[52px] items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3.5 py-2.5 text-slate-900 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-bold">{title}</span>
        {detail && <span className={`truncate text-xs ${detailClass}`}>{detail}</span>}
      </span>
      {right ?? <ChevronRightIcon size={18} className="shrink-0 text-slate-400" />}
    </Link>
  );
}

function Trend({ trend, currency }) {
  const { t } = useTranslation(['manager']);
  const { money } = useMoney(currency);
  if (!trend?.length) return null;
  const max = Math.max(1, ...trend.map((w) => w.revenue));
  return (
    <div data-testid="revenue-trend" className="flex flex-col gap-2 border-t border-slate-100 pt-3">
      <span className="text-xs font-semibold text-slate-500">{t('manager:today.ops.trend')}</span>
      <ul className="grid h-16 grid-cols-8 items-end gap-1.5">
        {trend.map((w, idx) => (
          <li key={w.weekStart} className="flex h-full flex-col justify-end" title={`${w.weekStart} · ${money(w.revenue)}`}>
            <span className="sr-only">{t('manager:today.ops.trendWeek', { week: w.weekStart, amount: money(w.revenue) })}</span>
            <span
              aria-hidden="true"
              className={`block rounded-t-md ${idx === trend.length - 1 ? 'bg-[#00798c]' : 'bg-[#a5e3ec]'}`}
              style={{ height: `${Math.max((w.revenue / max) * 100, 4)}%` }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function OpsStrip({ data, isDesktop }) {
  const { t } = useTranslation(['manager']);
  const { money } = useMoney(data?.money?.currency || 'EUR');
  if (!data) return null;
  const { rentals, stays, gear } = data;
  const overdue = rentals.overdue
    ? t('manager:today.ops.overdue', { count: rentals.overdue })
    : (rentals.upcoming ? t('manager:today.ops.rentalsUpcoming', { count: rentals.upcoming }) : null);
  const gearParts = [];
  if (gear.needsService) gearParts.push(t('manager:today.ops.needsService', { count: gear.needsService }));
  if (gear.lowStock) gearParts.push(t('manager:today.ops.lowStock', { count: gear.lowStock }));

  return (
    <section aria-labelledby="ops-title" data-testid="ops-strip" className={`${cardClass} flex min-w-0 flex-col gap-2.5 ${isDesktop ? 'p-5' : 'p-4'}`}>
      <h2 id="ops-title" className="text-base font-bold text-slate-900">{t('manager:today.ops.title')}</h2>
      <Row
        testId="ops-rentals"
        to="/calendars/rentals"
        title={t('manager:today.ops.rentalsOut', { count: rentals.out })}
        detail={overdue}
        detailClass={rentals.overdue ? 'font-semibold text-orange-800' : 'text-slate-600'}
        right={rentals.outValue > 0 ? <span className="text-sm font-bold tabular-nums">{money(rentals.outValue)}</span> : undefined}
      />
      <Row
        testId="ops-stays"
        to="/calendars/stay"
        title={t('manager:today.ops.stays')}
        detail={t('manager:today.ops.staysDetail', { checkIns: stays.checkIns, checkOuts: stays.checkOuts, occupied: stays.occupied, units: stays.units })}
      />
      <Row
        testId="ops-gear"
        to="/equipment"
        title={t('manager:today.ops.gear')}
        detail={gearParts.length ? gearParts.join(' · ') : t('manager:today.ops.gearOk')}
      />
      {isDesktop && <Trend trend={data.money?.trend} currency={data.money?.currency || 'EUR'} />}
      <Link to="/admin/dashboard" className="text-sm font-semibold text-[#00687a] hover:text-[#005f6e]">{t('manager:today.ops.reports')}</Link>
    </section>
  );
}
