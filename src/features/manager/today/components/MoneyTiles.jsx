// Money at a glance, each compared with the same days of last week. The last
// tile is the manager's own commission (managers) or the instructor payout
// requests waiting for a decision (other staff).
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMoney } from '@/features/instructor/earnings/earningsFormat';
import { percentChange } from '../managerTodayFormat';

function Delta({ current, previous, label }) {
  const { t } = useTranslation(['manager']);
  const pct = percentChange(current, previous);
  if (pct === null) return <span className="text-xs text-slate-500">{t('manager:today.money.noComparison')}</span>;
  const up = pct >= 0;
  return (
    <span className={`text-xs font-semibold tabular-nums ${up ? 'text-emerald-700' : 'text-rose-700'}`}>
      {up ? '▲' : '▼'} {t('manager:today.money.delta', { pct: Math.abs(pct), label })}
    </span>
  );
}

function Tile({ label, value, children, valueClass = 'text-slate-900', testId }) {
  return (
    <div data-testid={testId} className="flex min-w-0 flex-col gap-0.5 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <span className={`truncate text-xl font-extrabold tabular-nums ${valueClass}`}>{value}</span>
      {children}
    </div>
  );
}

export default function MoneyTiles({ data, isDesktop }) {
  const { t, i18n } = useTranslation(['manager']);
  const { money } = useMoney(data?.money?.currency || 'EUR');
  const m = data?.money;
  if (!m) return null;
  // Full weekday in the app language ("last Thursday" / "geçen Perşembe"), not the browser's short form.
  const weekday = new Intl.DateTimeFormat(i18n?.language || 'en', { weekday: 'long' }).format(new Date(`${data.today}T12:00:00`));
  const commission = data.myCommission;
  const payouts = data.actions?.payoutRequests;

  return (
    <section aria-label={t('manager:today.money.title')} data-testid="money-tiles" className={`grid gap-2.5 ${isDesktop ? 'grid-cols-2' : 'grid-cols-2'}`}>
      <Tile testId="money-today" label={t('manager:today.money.today')} value={money(m.revenueToday)}>
        <Delta current={m.revenueToday} previous={m.revenueSameDayLastWeek} label={t('manager:today.money.vsLastWeekday', { day: weekday })} />
      </Tile>
      <Tile testId="money-week" label={t('manager:today.money.week')} value={money(m.revenueWeek)}>
        <Delta current={m.revenueWeek} previous={m.revenueLastWeekSameDays} label={t('manager:today.money.vsLastWeek')} />
      </Tile>
      <Tile testId="money-outstanding" label={t('manager:today.money.outstanding')} value={money(m.outstanding?.amount || 0)} valueClass={m.outstanding?.amount > 0 ? 'text-orange-800' : 'text-slate-900'}>
        <span className="text-xs text-slate-600">
          {t('manager:today.money.customers', { count: m.outstanding?.customers || 0 })}
        </span>
      </Tile>
      {commission ? (
        <Tile testId="money-commission" label={t('manager:today.money.myCommission', { month: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(`${commission.month}-01T12:00:00`)) })} value={money(commission.earned)}>
          <Link to="/manager/finance/earnings" className="text-xs font-semibold text-[#00687a] hover:text-[#005f6e]">
            {t('manager:today.money.owed', { amount: money(commission.owed) })}
          </Link>
        </Tile>
      ) : (
        <Tile testId="money-payouts" label={t('manager:today.money.payoutRequests')} value={payouts?.count || 0}>
          <Link to="/finance/payout-requests" className="text-xs font-semibold text-[#00687a] hover:text-[#005f6e]">
            {payouts?.count ? money(payouts.amount) : t('manager:today.money.none')}
          </Link>
        </Tile>
      )}
    </section>
  );
}
