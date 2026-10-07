import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Decimal from 'decimal.js';
import { formatCurrency } from '@/shared/utils/formatters';
import PayoutRequestsTable from '../components/payoutRequests/PayoutRequestsTable';
import { PayPayoutModal, DeclinePayoutModal } from '../components/payoutRequests/PayoutActionModals';
import { usePayoutRequestList } from '../hooks/usePayoutRequests';

const HISTORY_FILTERS = ['all', 'paid', 'rejected', 'cancelled'];

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 m-0">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-900 m-0">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400 m-0">{hint}</p>}
    </div>
  );
}

function EmptyState({ title, hint }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-slate-500 m-0">{title}</p>
      <p className="text-xs text-slate-400 mt-1 mb-0">{hint}</p>
    </div>
  );
}

/**
 * Admin / manager: instructor payout requests — pending first (Pay / Decline),
 * then history. Route: /finance/payout-requests.
 */
export default function PayoutRequestsAdmin() {
  const { t } = useTranslation(['manager']);
  const { data: rows = [], isLoading, isError, refetch } = usePayoutRequestList('all');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [payTarget, setPayTarget] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);

  const pending = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows]);
  const history = useMemo(
    () => rows.filter((r) => r.status !== 'pending' && (historyFilter === 'all' || r.status === historyFilter)),
    [rows, historyFilter],
  );
  const pendingTotal = useMemo(
    () => pending.reduce((acc, r) => acc.plus(r.amount || 0), new Decimal(0)).toDecimalPlaces(2).toNumber(),
    [pending],
  );
  const paidThisMonth = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    return rows
      .filter((r) => r.status === 'paid' && (r.decidedAt || '').slice(0, 7) === month)
      .reduce((acc, r) => acc.plus(r.paidAmount ?? r.amount ?? 0), new Decimal(0))
      .toDecimalPlaces(2)
      .toNumber();
  }, [rows]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 m-0">{t('manager:financePages.payoutRequests.title')}</h1>
          <p className="mt-1 text-sm text-slate-500 m-0">{t('manager:financePages.payoutRequests.subtitle')}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard label={t('manager:financePages.payoutRequests.stats.pendingCount')} value={isLoading ? '—' : pending.length} />
          <StatCard label={t('manager:financePages.payoutRequests.stats.pendingAmount')} value={isLoading ? '—' : formatCurrency(pendingTotal, 'EUR')} />
          <StatCard label={t('manager:financePages.payoutRequests.stats.paidThisMonth')} value={isLoading ? '—' : formatCurrency(paidThisMonth, 'EUR')} />
        </div>

        {isError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700 flex items-center justify-between gap-3">
            <span>{t('manager:financePages.payoutRequests.loadError')}</span>
            <button type="button" onClick={() => refetch()} className="text-xs font-medium text-sky-600 hover:text-sky-800">
              {t('manager:financePages.refresh')}
            </button>
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide m-0">{t('manager:financePages.payoutRequests.tabs.pending')}</h2>
            {pending.length > 0 && (
              <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border-amber-200">{pending.length}</span>
            )}
          </div>
          {isLoading ? (
            <div className="p-5 space-y-3 animate-pulse">
              {[0, 1].map((i) => <div key={i} className="h-10 rounded-2xl bg-slate-200" />)}
            </div>
          ) : pending.length ? (
            <PayoutRequestsTable rows={pending} mode="pending" onPay={setPayTarget} onDecline={setDeclineTarget} />
          ) : (
            <EmptyState title={t('manager:financePages.payoutRequests.empty.pendingTitle')} hint={t('manager:financePages.payoutRequests.empty.pendingHint')} />
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide m-0">{t('manager:financePages.payoutRequests.tabs.history')}</h2>
            <div className="flex flex-wrap gap-1.5">
              {HISTORY_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setHistoryFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${historyFilter === f
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  {f === 'all' ? t('manager:financePages.payoutRequests.filters.all') : t(`manager:financePages.payoutRequests.status.${f}`)}
                </button>
              ))}
            </div>
          </div>
          {isLoading ? null : history.length ? (
            <PayoutRequestsTable rows={history} mode="history" />
          ) : (
            <EmptyState title={t('manager:financePages.payoutRequests.empty.historyTitle')} hint={t('manager:financePages.payoutRequests.empty.historyHint')} />
          )}
        </section>
      </div>

      <PayPayoutModal request={payTarget} open={!!payTarget} onClose={() => setPayTarget(null)} />
      <DeclinePayoutModal request={declineTarget} open={!!declineTarget} onClose={() => setDeclineTarget(null)} />
    </div>
  );
}
