import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Empty, Pagination, Table, Tag } from 'antd';
import { ArrowRightOutlined, DownloadOutlined, ReloadOutlined, WalletOutlined, PlusOutlined } from '@ant-design/icons';
import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useStudentInvoices } from '../hooks/useStudentDashboard';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { useAuth } from '@/shared/hooks/useAuth';
import { getWalletBalance } from '../utils/getWalletBalance';
import { WalletDepositModal } from '@/features/finances';

const statusColors = {
  completed: 'green',
  succeeded: 'green',
  processing: 'blue',
  pending: 'blue',
  requires_payment_method: 'gold',
  failed: 'red',
  refunded: 'purple'
};

const buildColumns = (formatCurrency, displayCurrency, storageCurrency, convertCurrency) => [
  {
    title: 'Date',
    dataIndex: 'lessonDate',
    render: (value, record) => {
      const source = value || record?.createdAt;
      return source ? dayjs(source).format('MMM D, YYYY') : '—';
    },
    width: 140
  },
  {
    title: 'Time',
    dataIndex: 'lessonStartTime',
    render: (value, record) => {
      if (value) return value;
      return record?.createdAt ? dayjs(record.createdAt).format('HH:mm') : '—';
    },
    width: 100
  },
  {
    title: 'Description',
    dataIndex: 'description',
    ellipsis: true
  },
  {
    title: 'Amount',
    dataIndex: 'amount',
    render: (value, record) => {
      const amountValue = Number.parseFloat(value ?? 0);
      const baseCurrency = record.currency || storageCurrency;
      if (!Number.isFinite(amountValue)) {
        return formatCurrency(0, baseCurrency);
      }
      // For completed/paid transactions, show the historical amount as recorded
      // Don't convert with current exchange rates - show what was actually paid
      const status = String(record.status || '').toLowerCase();
      const isCompleted = ['completed', 'succeeded', 'paid'].includes(status);
      
      if (isCompleted) {
        // Show the original recorded amount - this is the historical value
        return formatCurrency(amountValue, baseCurrency);
      }
      
      // For pending/future payments, show dual currency with current rates
      const showDual = baseCurrency !== displayCurrency;
      if (showDual && convertCurrency) {
        const converted = convertCurrency(amountValue, baseCurrency, displayCurrency);
        return `${formatCurrency(amountValue, baseCurrency)} / ${formatCurrency(converted, displayCurrency)}`;
      }
      return formatCurrency(amountValue, baseCurrency);
    },
    align: 'right',
    width: 200
  },
  {
    title: 'Status',
    dataIndex: 'status',
    render: (value) => <Tag color={statusColors[value] ?? 'default'}>{value}</Tag>,
    width: 140
  }
];

const computeInvoiceRows = (invoices, fallbackPayments) => {
  if (Array.isArray(invoices) && invoices.length > 0) {
    return invoices;
  }

  if (Array.isArray(fallbackPayments) && fallbackPayments.length > 0) {
    return fallbackPayments;
  }

  return [];
};

const computeTotals = (rows) => {
  return rows.reduce(
    (acc, invoice) => {
      const raw = Number.parseFloat(invoice?.amount ?? 0);
      const amount = Number.isFinite(raw) ? raw : 0;
      const status = String(invoice?.status || '').toLowerCase();

      if (['completed', 'succeeded', 'paid'].includes(status)) {
        acc.settledAmount += amount;
      } else if (status) {
        acc.pendingAmount += amount;
        acc.pendingCount += 1;
      }

      return acc;
    },
    { settledAmount: 0, pendingAmount: 0, pendingCount: 0, totalCount: rows.length }
  );
};

const computeTotalRecords = (paginationTotal, dataTotal, fallbackLength) => {
  if (typeof paginationTotal === 'number' && Number.isFinite(paginationTotal)) {
    return paginationTotal;
  }

  if (typeof dataTotal === 'number' && Number.isFinite(dataTotal)) {
    return dataTotal;
  }

  return fallbackLength;
};

const resolveWalletAmount = (walletSummary, walletBalance, wallet, walletSummaryData, account) => {
  const resolved = getWalletBalance(
    walletSummary,
    walletBalance,
    wallet,
    walletSummaryData,
    account
  );

  if (typeof resolved === 'number' && Number.isFinite(resolved)) {
    return resolved;
  }

  return 0;
};

const usePaymentsErrorNotification = (error, notification) => {
  useEffect(() => {
    if (!error) {
      return;
    }

    notification.error({
      message: 'Unable to load payments',
      description: error.message,
      placement: 'bottomRight'
    });
  }, [error, notification]);
};

const useWalletOpener = () => {
  return useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.dispatchEvent(new CustomEvent('wallet:open'));
    window.dispatchEvent(new CustomEvent('studentWallet:open'));
  }, []);
};

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

  // Handle payment result from Iyzico callback
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
        duration: 6,
        placement: 'topRight'
      });
      // Refresh wallet data
      refetch();
      // Clear the query params
      navigate('/student/payments', { replace: true });
    } else if (paymentResult === 'failed') {
      const reason = searchParams.get('reason');
      const errorMsg = reason ? `Reason: ${decodeURIComponent(reason)}` : 'Your payment could not be processed. Please try again.';
      
      notification.error({
        message: 'Payment Failed',
        description: errorMsg,
        duration: 10,
        placement: 'topRight'
      });
      // Clear the query params
      navigate('/student/payments', { replace: true });
    }
  }, [searchParams, notification, navigate, refetch]);

  // Storage currency is always EUR (base currency)
  const storageCurrency = businessCurrency || 'EUR';
  
  // Display currency is user's preferred currency  
  const displayCurrency = useMemo(
    () => userCurrency || overview?.student?.preferredCurrency || storageCurrency,
    [userCurrency, overview?.student?.preferredCurrency, storageCurrency]
  );

  // Query wallet in storage currency (EUR)
  const { data: walletSummary } = useWalletSummary({
    enabled: isAuthenticated,
    currency: storageCurrency
  });

  const studentAccount = overview?.student?.account;
  const dataWalletBalance = data?.walletBalance;
  const dataWallet = data?.wallet;
  const dataWalletSummary = data?.walletSummary;

  // Get raw balance in storage currency (EUR)
  const rawWalletBalance = useMemo(
    () => resolveWalletAmount(walletSummary, dataWalletBalance, dataWallet, dataWalletSummary, studentAccount),
    [walletSummary, dataWalletBalance, dataWallet, dataWalletSummary, studentAccount]
  );

  // Convert balance from EUR to user's display currency
  const walletBalanceAmount = useMemo(() => {
    if (!rawWalletBalance || rawWalletBalance === 0) {
      return 0;
    }
    // Convert from storage currency (EUR) to display currency
    if (convertCurrency && displayCurrency !== storageCurrency) {
      return convertCurrency(rawWalletBalance, storageCurrency, displayCurrency);
    }
    return rawWalletBalance;
  }, [rawWalletBalance, convertCurrency, storageCurrency, displayCurrency]);

  // Helper to format with dual currency display
  const showDualCurrency = displayCurrency !== storageCurrency;
  const formatDualAmount = useCallback((amount, baseCurrency = storageCurrency) => {
    if (!showDualCurrency || !convertCurrency) {
      return formatCurrency(amount, baseCurrency);
    }
    const converted = convertCurrency(amount, baseCurrency, displayCurrency);
    return `${formatCurrency(amount, baseCurrency)} / ${formatCurrency(converted, displayCurrency)}`;
  }, [showDualCurrency, convertCurrency, formatCurrency, storageCurrency, displayCurrency]);

  const columns = useMemo(
    () => buildColumns(formatCurrency, displayCurrency, storageCurrency, convertCurrency),
    [formatCurrency, displayCurrency, storageCurrency, convertCurrency]
  );

  usePaymentsErrorNotification(error, notification);

  const invoices = data?.invoices;
  const fallbackPayments = overview?.payments;

  const invoiceRows = useMemo(
    () => computeInvoiceRows(invoices, fallbackPayments),
    [invoices, fallbackPayments]
  );

  const totals = useMemo(
    () => computeTotals(invoiceRows),
    [invoiceRows]
  );

  const paginationTotal = data?.pagination?.total;
  const dataTotal = data?.total;

  const totalRecords = useMemo(
    () => computeTotalRecords(paginationTotal, dataTotal, invoiceRows.length),
    [paginationTotal, dataTotal, invoiceRows.length]
  );

  const summary = useMemo(
    () => ({
      balance: walletBalanceAmount,
      total: totalRecords
    }),
    [walletBalanceAmount, totalRecords]
  );

  const openWallet = useWalletOpener();

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-sky-600 p-6 text-white shadow-[0_20px_45px_rgba(5,90,70,0.35)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:justify-between">
          <div className="flex-1 space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/80 shadow-sm">
              <DownloadOutlined /> Payments & Invoices
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold leading-tight">Stay on top of your balances</h2>
              <p className="text-sm text-white/75 max-w-xl">
                Review recent transactions, follow up on pending payments, and open your wallet with one click.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-white/20 bg-white/12 p-4 shadow-[0_12px_28px_rgba(17,94,76,0.30)] backdrop-blur-lg">
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/85">Wallet Balance</p>
                <p className="mt-3 text-2xl font-semibold text-white">
                  {formatDualAmount(rawWalletBalance, storageCurrency)}
                </p>
                <p className="mt-1 text-xs text-white/70">Available to spend right now</p>
              </div>
              <div className="rounded-2xl border border-white/18 bg-white/10 p-4 shadow-[0_12px_28px_rgba(27,108,182,0.28)] backdrop-blur-lg">
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/85">Settled Invoices</p>
                <div className="mt-3 flex items-end gap-2 text-white">
                  <span className="text-3xl font-semibold">{totals.totalCount - totals.pendingCount}</span>
                  <span className="text-xs text-white/70">paid</span>
                </div>
                <p className="mt-1 text-xs text-white/65">Count of completed invoices</p>
              </div>
              <div className="rounded-2xl border border-white/18 bg-white/10 p-4 shadow-[0_12px_28px_rgba(19,91,255,0.30)] backdrop-blur-lg">
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/85">Settled Amount</p>
                <p className="mt-3 text-2xl font-semibold text-white">
                  {formatDualAmount(totals.settledAmount, storageCurrency)}
                </p>
                <p className="mt-1 text-xs text-white/65">Total value of paid invoices</p>
              </div>
              <div className="rounded-2xl border border-white/18 bg-white/10 p-4 shadow-[0_12px_28px_rgba(6,72,160,0.28)] backdrop-blur-lg">
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/85">Pending</p>
                <div className="mt-3 flex items-end gap-2 text-white">
                  <span className="text-3xl font-semibold">{totals.pendingCount}</span>
                  <span className="text-xs text-white/70">awaiting</span>
                </div>
                <p className="mt-1 text-xs text-white/65">Invoices still processing</p>
              </div>
            </div>
          </div>
          <div className="mt-6 flex w-full max-w-xs flex-col gap-3 rounded-3xl border border-white/18 bg-white/14 p-5 backdrop-blur-xl shadow-[0_16px_36px_rgba(15,100,140,0.32)] lg:mt-0 lg:w-80">
            <p className="text-sm text-white/80">Need a receipt or want to top up? Jump into your wallet or refresh the table.</p>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setDepositModalVisible(true)}
              className="h-11 rounded-2xl border-0 bg-gradient-to-r from-amber-400 to-orange-500 text-white font-medium shadow-[0_10px_25px_rgba(251,191,36,0.35)] transition hover:from-amber-500 hover:to-orange-600"
            >
              Add Funds
            </Button>
            <Button
              type="primary"
              icon={<WalletOutlined />}
              onClick={openWallet}
              className="h-11 rounded-2xl border-0 bg-white text-emerald-600 shadow-[0_10px_25px_rgba(15,90,70,0.35)] transition hover:bg-slate-100"
            >
              Open wallet
            </Button>
            <Button
              ghost
              icon={<ReloadOutlined />}
              onClick={() => refetch()}
              loading={isLoading}
              className="h-11 rounded-2xl border-white/45 text-white shadow-[0_8px_22px_rgba(255,255,255,0.22)] hover:bg-white/15"
            >
              Refresh list
            </Button>
          </div>
        </div>
      </div>

      <Card
        className="rounded-3xl border border-slate-200/80 shadow-sm"
        title="Payment history"
        extra={
          <Button type="link" icon={<ArrowRightOutlined />} onClick={() => refetch()} disabled={isLoading}>
            Refresh
          </Button>
        }
      >
        <div className="w-full overflow-auto">
          <Table
            rowKey={(record) => record.id}
            loading={isLoading}
            columns={columns}
            dataSource={invoiceRows}
            pagination={false}
            locale={{ emptyText: <Empty description="No payments yet" /> }}
            scroll={{ x: 'max-content', y: 360 }}
          />
        </div>

        {summary.total > 10 && (
          <div className="mt-4 flex justify-end">
            <Pagination
              current={page}
              pageSize={10}
              total={summary.total}
              onChange={(nextPage) => setPage(nextPage)}
            />
          </div>
        )}
      </Card>

      {/* Iyzico Para Yükleme Modal */}
      <WalletDepositModal
        visible={depositModalVisible}
        onClose={() => setDepositModalVisible(false)}
        onSuccess={() => {
          setDepositModalVisible(false);
          refetch(); // Refresh list after payment
          notification.success({
            message: 'Funds Added',
            description: 'The amount has been successfully added to your wallet.',
            placement: 'bottomRight'
          });
        }}
      />
    </div>
  );
};

export default StudentPayments;
