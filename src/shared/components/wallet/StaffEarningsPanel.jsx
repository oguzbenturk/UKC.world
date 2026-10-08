// "My earnings" section of My Wallet for instructors / managers (staff wallet,
// owner decisions 2026-10-08). Earnings available = closed lessons / recorded
// commissions − paid out − spent in the app − deductions; spendable in the shop
// with "Pay with my earnings". Amounts arrive in EUR (the ledger base) and are
// shown in the user's currency like the wallet balance.
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { walletApi } from '@/shared/services/walletApi';

const HISTORY_LIMIT = 20;

const KIND_STYLE = {
  earned: { sign: '+', className: 'text-emerald-600' },
  paid_out: { sign: '−', className: 'text-slate-600' },
  spent: { sign: '−', className: 'text-sky-700' },
  deducted: { sign: '−', className: 'text-rose-600' },
};

const formatDate = (value, locale) => {
  if (!value) return '';
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(d);
};

function Stat({ label, value }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-slate-50 px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="truncate text-sm font-bold tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

function EarningsHistory({ query, money, locale, startDate }) {
  const { t } = useTranslation(['common']);
  const items = Array.isArray(query.data?.items) ? query.data.items : [];
  return (
    <div className="mt-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('common:staffEarnings.history')}</p>
      {query.isLoading && <p className="py-3 text-sm text-slate-400">{t('common:staffEarnings.loading')}</p>}
      {!query.isLoading && items.length === 0 && (
        <p className="py-3 text-sm text-slate-500">{t('common:staffEarnings.empty')}</p>
      )}
      {items.length > 0 && (
        <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto">
          {items.map((item) => {
            const style = KIND_STYLE[item.kind] || KIND_STYLE.earned;
            return (
              <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-slate-800">
                    {item.label || t(`common:staffEarnings.kinds.${item.kind}`)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {[formatDate(item.date, locale), t(`common:staffEarnings.kinds.${item.kind}`)].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${style.className}`}>
                  {style.sign}{money(item.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        {t('common:staffEarnings.startNote', { date: formatDate(startDate, locale) })}
      </p>
    </div>
  );
}

export default function StaffEarningsPanel({ earnings, open }) {
  const { t, i18n } = useTranslation(['common']);
  const { formatCurrency, convertCurrency, userCurrency, businessCurrency } = useCurrency();
  const baseCurrency = earnings?.currency || 'EUR';
  const displayCurrency = userCurrency || businessCurrency || baseCurrency;
  const money = (amount) => {
    const n = Number(amount) || 0;
    const shown = convertCurrency && displayCurrency !== baseCurrency ? convertCurrency(n, baseCurrency, displayCurrency) : n;
    return formatCurrency(shown, displayCurrency);
  };

  const activity = useQuery({
    queryKey: ['wallet', 'earnings-activity', HISTORY_LIMIT],
    queryFn: () => walletApi.fetchEarningsActivity({ limit: HISTORY_LIMIT }),
    enabled: Boolean(open && earnings),
    staleTime: 30_000,
  });

  if (!earnings) return null;
  const locale = i18n?.language || 'en';

  return (
    <section aria-labelledby="staff-earnings-title" data-testid="staff-earnings-panel" className="border-b border-slate-100 px-6 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <h3 id="staff-earnings-title" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('common:staffEarnings.title')}
          </h3>
          <span data-testid="staff-earnings-available" className="mt-1 text-2xl font-bold tabular-nums text-[#00687a]">
            {money(earnings.available)}
          </span>
          <span className="text-xs text-slate-500">{t('common:staffEarnings.availableHint')}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label={t('common:staffEarnings.earned')} value={money(earnings.earned)} />
        <Stat label={t('common:staffEarnings.paidOut')} value={money(earnings.paidOut)} />
        <Stat label={t('common:staffEarnings.spentInApp')} value={money(earnings.spentInApp)} />
      </div>
      {Number(earnings.deducted) > 0 && (
        <p className="mt-2 text-xs text-slate-600">
          {t('common:staffEarnings.deductedLine', { amount: money(earnings.deducted) })}
        </p>
      )}

      <EarningsHistory query={activity} money={money} locale={locale} startDate={earnings.startDate} />
    </section>
  );
}
