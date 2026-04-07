import { useCallback, useEffect, useMemo, useState } from 'react';
import { App } from 'antd';
import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useStudentInvoices } from '../hooks/useStudentDashboard';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { useAuth } from '@/shared/hooks/useAuth';
import { getWalletBalance } from '../utils/getWalletBalance';
import { WalletDepositModal } from '@/features/finances';

/* ── Status badge styles ── */
const STATUS_STYLES = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  succeeded: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paid:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  processing:'bg-sky-50 text-sky-700 border-sky-200',
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  requires_payment_method: 'bg-amber-50 text-amber-700 border-amber-200',
  failed:    'bg-rose-50 text-rose-700 border-rose-200',
  refunded:  'bg-violet-50 text-violet-700 border-violet-200',
};

/* ── Helpers ── */

const computeInvoiceRows = (invoices, fallbackPayments) => {
  if (Array.isArray(invoices) && invoices.length > 0) return invoices;
  if (Array.isArray(fallbackPayments) && fallbackPayments.length > 0) return fallbackPayments;
  return [];
};

const computeTotals = (rows, storageCurrency, convertCurrency) =>
  rows.reduce(
    (acc, invoice) => {
      const raw = Number.parseFloat(invoice?.amount ?? 0);
      if (!Number.isFinite(raw)) return acc;
      const rowCurrency = invoice.currency || storageCurrency;
      const amount = rowCurrency !== storageCurrency && convertCurrency
        ? convertCurrency(raw, rowCurrency, storageCurrency)
        : raw;
      const status = String(invoice?.status || '').toLowerCase();
      if (['completed', 'succeeded', 'paid'].includes(status)) {
        acc.settledAmount += amount;
        acc.settledCount += 1;
      } else if (status) {
        acc.pendingAmount += amount;
        acc.pendingCount += 1;
      }
      return acc;
    },
    { settledAmount: 0, settledCount: 0, pendingAmount: 0, pendingCount: 0, totalCount: rows.length },
  );

const computeTotalRecords = (paginationTotal, dataTotal, fallbackLength) => {
  if (typeof paginationTotal === 'number' && Number.isFinite(paginationTotal)) return paginationTotal;
  if (typeof dataTotal === 'number' && Number.isFinite(dataTotal)) return dataTotal;
  return fallbackLength;
};

const resolveWalletAmount = (walletSummary, walletBalance, wallet, walletSummaryData, account) => {
  const resolved = getWalletBalance(walletSummary, walletBalance, wallet, walletSummaryData, account);
  return typeof resolved === 'number' && Number.isFinite(resolved) ? resolved : 0;
};

/* ── Skeleton ── */
const PaymentsSkeleton = () => (
  <div className="space-y-5 animate-pulse">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-2xl bg-slate-200" />)}
    </div>
    <div className="h-10 rounded-xl bg-slate-200 w-48" />
    <div className="space-y-3">
      {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-slate-200" />)}
    </div>
  </div>
);

/* ── Main component ── */

// eslint-disable-next-line complexity
const StudentPayments = () => {
  const { notification } = App.useApp();
  const outletContext = useOutletContext() ?? {};
  const overview = outletContext?.overview;
  const [page, setPage] = useState(1);
  const [depositModalVisible, setDepositModalVisible] = useState(false);
  const { data, isLoading, error, refetch } = useStudentInvoices({ page, limit: 10 });
  const { formatCurrency, businessCurrency, userCurrency, convertCurrency } = useCurrency();
  const { isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  /* payment callback from Iyzico */
  useEffect(() => {
    const paymentResult = searchParams.get('payment');
    const amount = searchParams.get('amount');
    const currency = searchParams.get('currency');
    if (paymentResult === 'success') {
      notification.success({
        message: 'Payment Successful!',
        description: amount && currency
          ? `Your deposit of ${amount} ${currency} has been processed successfully.`
          : 'Your deposit has been processed successfully.',
        duration: 6, placement: 'topRight',
      });
      refetch();
      navigate('/student/payments', { replace: true });
    } else if (paymentResult === 'failed') {
      const reason = searchParams.get('reason');
      notification.error({
        message: 'Payment Failed',
        description: reason ? `Reason: ${decodeURIComponent(reason)}` : 'Your payment could not be processed. Please try again.',
        duration: 10, placement: 'topRight',
      });
      navigate('/student/payments', { replace: true });
    }
  }, [searchParams, notification, navigate, refetch]);

  const storageCurrency = businessCurrency || 'EUR';
  const displayCurrency = useMemo(
    () => userCurrency || overview?.student?.preferredCurrency || storageCurrency,
    [userCurrency, overview?.student?.preferredCurrency, storageCurrency],
  );

  const { data: walletSummary } = useWalletSummary({ enabled: isAuthenticated, currency: storageCurrency });
  const studentAccount = overview?.student?.account;

  const rawWalletBalance = useMemo(
    () => resolveWalletAmount(walletSummary, data?.walletBalance, data?.wallet, data?.walletSummary, studentAccount),
    [walletSummary, data?.walletBalance, data?.wallet, data?.walletSummary, studentAccount],
  );

  const showDualCurrency = displayCurrency !== storageCurrency;

  const formatDualAmount = useCallback(
    (amount, baseCurrency = storageCurrency) => {
      if (!showDualCurrency || !convertCurrency) return formatCurrency(amount, baseCurrency);
      const converted = convertCurrency(amount, baseCurrency, displayCurrency);
      return `${formatCurrency(amount, baseCurrency)} / ${formatCurrency(converted, displayCurrency)}`;
    },
    [showDualCurrency, convertCurrency, formatCurrency, storageCurrency, displayCurrency],
  );

  const formatAmountForRow = useCallback(
    (value, record) => {
      const amountValue = Number.parseFloat(value ?? 0);
      const baseCurrency = record.currency || storageCurrency;
      if (!Number.isFinite(amountValue)) return formatCurrency(0, baseCurrency);
      const status = String(record.status || '').toLowerCase();
      if (['completed', 'succeeded', 'paid'].includes(status)) return formatCurrency(amountValue, baseCurrency);
      if (baseCurrency !== displayCurrency && convertCurrency) {
        const converted = convertCurrency(amountValue, baseCurrency, displayCurrency);
        return `${formatCurrency(amountValue, baseCurrency)} / ${formatCurrency(converted, displayCurrency)}`;
      }
      return formatCurrency(amountValue, baseCurrency);
    },
    [formatCurrency, displayCurrency, storageCurrency, convertCurrency],
  );

  useEffect(() => {
    if (error) notification.error({ message: 'Unable to load payments', description: error.message, placement: 'bottomRight' });
  }, [error, notification]);

  const invoiceRows = useMemo(() => computeInvoiceRows(data?.invoices, overview?.payments), [data?.invoices, overview?.payments]);
  const totals = useMemo(() => computeTotals(invoiceRows, storageCurrency, convertCurrency), [invoiceRows, storageCurrency, convertCurrency]);
  const totalRecords = useMemo(() => computeTotalRecords(data?.pagination?.total, data?.total, invoiceRows.length), [data?.pagination?.total, data?.total, invoiceRows.length]);
  const totalPages = Math.ceil(totalRecords / 10);

  const openWallet = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('wallet:open'));
    window.dispatchEvent(new CustomEvent('studentWallet:open'));
  }, []);

  if (isLoading && invoiceRows.length === 0) return <PaymentsSkeleton />;

  return (
    <div className="space-y-5">
      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Wallet Balance</p>
          <p className="mt-2 text-xl font-bold text-emerald-600">{formatDualAmount(rawWalletBalance, storageCurrency)}</p>
          <p className="mt-1 text-xs text-slate-400">Available to spend</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Settled</p>
          <p className="mt-2 text-xl font-bold text-emerald-600">{totals.settledCount}</p>
          <p className="mt-1 text-xs text-slate-400">Completed invoices</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Settled Amount</p>
          <p className="mt-2 text-xl font-bold text-emerald-600">{formatDualAmount(totals.settledAmount, storageCurrency)}</p>
          <p className="mt-1 text-xs text-slate-400">Total paid</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending</p>
          <p className="mt-2 text-xl font-bold text-rose-600">{totals.pendingCount}</p>
          <p className="mt-1 text-xs text-slate-400">Awaiting processing</p>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setDepositModalVisible(true)}
          className="px-5 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-medium shadow-sm hover:bg-sky-500 transition-colors"
        >
          + Add Funds
        </button>
        <button
          type="button"
          onClick={openWallet}
          className="px-5 py-2.5 rounded-xl bg-white text-slate-700 text-sm font-medium border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors"
        >
          Open Wallet
        </button>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isLoading}
          className="px-5 py-2.5 rounded-xl bg-white text-slate-700 text-sm font-medium border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* ── Payment history ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Payment History</h2>
        </div>

        {invoiceRows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">No payments yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                  <th className="text-left px-5 py-3 font-semibold">Date</th>
                  <th className="text-left px-5 py-3 font-semibold">Description</th>
                  <th className="text-right px-5 py-3 font-semibold">Amount</th>
                  <th className="text-left px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoiceRows.map((row, idx) => {
                  const dateSource = row.lessonDate || row.createdAt;
                  const status = String(row.status || '').toLowerCase();
                  const badgeCls = STATUS_STYLES[status] || 'bg-slate-100 text-slate-600 border-slate-200';
                  const amt = Number.parseFloat(row.amount ?? 0);
                  const isCredit = row.direction === 'credit' || row.type === 'refund' || row.type === 'credit';
                  const amountCls = (isCredit || amt > 0) ? 'text-emerald-600' : 'text-rose-600';
                  return (
                    <tr key={row.id || idx} className={`border-b border-slate-100 last:border-b-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                      <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">
                        {dateSource ? dayjs(dateSource).format('MMM D, YYYY') : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-slate-800">{row.description || '—'}</td>
                      <td className={`px-5 py-3.5 text-right font-medium whitespace-nowrap ${amountCls}`}>
                        {formatAmountForRow(row.amount, row)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeCls}`}>
                          {row.status || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Deposit modal */}
      <WalletDepositModal
        visible={depositModalVisible}
        onClose={() => setDepositModalVisible(false)}
        onSuccess={async () => {
          setDepositModalVisible(false);
          await refetch();
          notification.success({
            message: 'Funds Added',
            description: 'The amount has been successfully added to your wallet.',
            placement: 'bottomRight',
          });
        }}
      />
    </div>
  );
};

export default StudentPayments;
