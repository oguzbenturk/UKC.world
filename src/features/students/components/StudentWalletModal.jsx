import { useCallback } from 'react';
import { Modal, Tag, Spin, Alert } from 'antd';
import { WalletIcon } from '@heroicons/react/24/outline';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletTransactions } from '@/shared/hooks/useWalletTransactions';

// Storage currency is always EUR (base currency)
const STORAGE_CURRENCY = 'EUR';

const resolveTransactionAmount = (transaction, formatCurrency, displayCurrencyCode, convertCurrency, storageCurrency) => {
  const rawAmount = Number.parseFloat(transaction.amount);
  const signedAmount = transaction.direction === 'debit' ? -rawAmount : rawAmount;
  const normalized = Number.isFinite(signedAmount) ? signedAmount : 0;
  
  // Transaction amounts are stored - show the historical amount as recorded
  const transactionCurrency = transaction.currency || storageCurrency;
  
  // Completed transactions: show historical amount only (what was actually paid)
  // Don't convert with current exchange rates - preserve the recorded value
  const status = String(transaction.status || 'completed').toLowerCase();
  const isCompleted = ['completed', 'succeeded', 'paid', 'processed'].includes(status);
  
  if (isCompleted) {
    // Return the original recorded amount - this is the historical value
    return formatCurrency(normalized, transactionCurrency);
  }
  
  // For pending transactions, show dual currency with current rates
  const showDual = transactionCurrency !== displayCurrencyCode && convertCurrency;
  
  if (showDual) {
    let displayAmount = convertCurrency(Math.abs(normalized), transactionCurrency, displayCurrencyCode);
    displayAmount = normalized < 0 ? -displayAmount : displayAmount;
    return `${formatCurrency(normalized, transactionCurrency)} / ${formatCurrency(displayAmount, displayCurrencyCode)}`;
  }
  
  return formatCurrency(normalized, transactionCurrency);
};

const resolveTransactionLabel = (transaction) => {
  if (transaction.description) {
    return transaction.description;
  }
  const normalized = String(transaction.transaction_type || '').replace(/_/g, ' ').trim();
  if (!normalized) {
    return 'Wallet activity';
  }
  return normalized
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatTransactionDate = (value) => {
  if (!value) {
    return '';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return '';
  }
};

const buildQuickStats = ({
  lastCreditTransaction,
  latestActivity,
  formatDate,
  resolveLabel,
}) => [
  {
    label: 'Last top-up',
    value: lastCreditTransaction
      ? formatDate(lastCreditTransaction.transaction_date || lastCreditTransaction.created_at)
      : 'No top-ups yet',
    hint: lastCreditTransaction ? resolveLabel(lastCreditTransaction) : null,
  },
  {
    label: 'Latest activity',
    value: latestActivity ? resolveLabel(latestActivity) : 'No activity yet',
    hint: latestActivity
      ? formatDate(latestActivity.transaction_date || latestActivity.created_at)
      : null,
  },
];

const TransactionsPanel = ({
  transactionsQuery,
  transactions,
  currencyDisplay,
  resolveLabel,
  formatDate,
  renderTransactionAmount,
  limit,
}) => (
  <section className="rounded-[22px] border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-slate-900">Recent activity</h2>
      <Tag color="purple" className="rounded-full border-0 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
        Last {limit} records
      </Tag>
    </div>

    {transactionsQuery.isLoading ? (
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Spin size="small" />
        <span className="text-sm">Loading latest wallet activity…</span>
      </div>
    ) : transactionsQuery.isError ? (
      <Alert
        type="error"
        message="Unable to load wallet transactions"
        description="Please try again in a moment."
        showIcon
      />
    ) : transactions.length > 0 ? (
      <div className="flex flex-col gap-3">
        {transactions.map((transaction) => {
          const isDebit = transaction.direction === 'debit';
          const hasOriginalCurrency = transaction.original_currency && 
            transaction.original_currency !== transaction.currency;
          return (
            <article
              key={transaction.id}
              className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span
                className={`absolute inset-y-0 left-0 w-1 ${isDebit ? 'bg-gradient-to-b from-rose-400 to-orange-500' : 'bg-gradient-to-b from-emerald-400 to-teal-500'}`}
                aria-hidden
              />
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900">{resolveLabel(transaction)}</p>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">
                    {formatDate(transaction.transaction_date || transaction.created_at)}
                  </p>
                </div>
                <Tag
                  color={isDebit ? 'volcano' : 'green'}
                  className="rounded-full border-0 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide"
                >
                  {isDebit ? 'Debit' : 'Credit'}
                </Tag>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <p className={`text-lg font-semibold ${isDebit ? 'text-rose-500' : 'text-emerald-600'}`}>
                    {renderTransactionAmount(transaction)}
                  </p>
                  {hasOriginalCurrency && (
                    <p className="text-[11px] text-slate-400" title={`Exchange rate: ${transaction.transaction_exchange_rate}`}>
                      Originally {transaction.original_amount} {transaction.original_currency}
                    </p>
                  )}
                </div>
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {(transaction.status || 'completed').toString()}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    ) : (
      <div className="rounded-3xl border border-dashed border-slate-200/80 bg-slate-50/80 p-6 text-center text-sm text-slate-500">
        No transactions yet. Your top-ups and lesson payments will appear here for easy tracking
        {currencyDisplay ? (
          <span className="ml-1 font-semibold text-slate-600">
            ({currencyDisplay})
          </span>
        ) : null}
      </div>
    )}
  </section>
);

const QuickStat = ({ label, value, hint }) => (
  <div className="space-y-1">
    <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">{label}</p>
    <p className="text-sm font-medium text-white">{value}</p>
    {hint ? <p className="text-[11px] text-white/70">{hint}</p> : null}
  </div>
);

const TRANSACTION_LIMIT = 3;

const StudentWalletModal = ({ open, onClose, currency, balance }) => {
  const { formatCurrency, convertCurrency, businessCurrency, userCurrency } = useCurrency();
  
  // Query transactions in storage currency (EUR)
  const storageCurrency = businessCurrency || STORAGE_CURRENCY;
  const transactionsQuery = useWalletTransactions({
    currency: storageCurrency,
    enabled: open,
    limit: TRANSACTION_LIMIT,
  });

  const numericBalance = typeof balance === 'number' && Number.isFinite(balance) ? balance : 0;

  const resolvedCurrencyCode = userCurrency || currency?.code || storageCurrency;
  
  // Show dual currency when storage differs from display
  const showDualCurrency = storageCurrency !== resolvedCurrencyCode && convertCurrency;
  const convertedBalance = showDualCurrency ? convertCurrency(numericBalance, storageCurrency, resolvedCurrencyCode) : numericBalance;
  const formattedBalance = showDualCurrency 
    ? `${formatCurrency(numericBalance, storageCurrency)} / ${formatCurrency(convertedBalance, resolvedCurrencyCode)}`
    : formatCurrency(numericBalance, resolvedCurrencyCode);
  const currencyDisplay = currency?.symbol || resolvedCurrencyCode;

  const transactions = Array.isArray(transactionsQuery.data?.results)
    ? transactionsQuery.data.results
    : [];

  const renderTransactionAmount = useCallback(
    (transaction) => resolveTransactionAmount(transaction, formatCurrency, resolvedCurrencyCode, convertCurrency, storageCurrency),
    [formatCurrency, resolvedCurrencyCode, convertCurrency, storageCurrency]
  );

  const resolveLabel = useCallback((transaction) => resolveTransactionLabel(transaction), []);

  const formatDate = useCallback((value) => formatTransactionDate(value), []);

  const lastCreditTransaction = transactions.find((transaction) => transaction.direction === 'credit');
  const latestActivity = transactions[0];
  const latestActivityDate = latestActivity
    ? formatDate(latestActivity.transaction_date || latestActivity.created_at)
    : null;

  const quickStats = buildQuickStats({
    lastCreditTransaction,
    latestActivity,
    formatDate,
    resolveLabel,
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      centered
      className="student-wallet-modal modern-wallet-modal"
      destroyOnHidden
      styles={{
        body: { padding: 0, background: 'transparent' },
        content: { padding: 0, background: 'transparent', boxShadow: 'none' },
        mask: { backdropFilter: 'blur(6px)' }
      }}
    >
      <div className="overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/70 shadow-2xl backdrop-blur-xl">
        <header className="relative overflow-hidden bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-700 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                'radial-gradient(circle at 8% 16%, rgba(186,230,253,0.35), transparent 55%), radial-gradient(circle at 92% 84%, rgba(129,140,248,0.55), transparent 65%)'
            }}
            aria-hidden
          />
          <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur">
                  <WalletIcon className="h-6 w-6" aria-hidden />
                </span>
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.4em] text-white/60">Wallet</p>
                  <p className="text-3xl font-semibold leading-tight">{formattedBalance}</p>
                  <p className="max-w-xs text-sm text-white/70">
                    Add balance anytime and pay for lessons or rentals in a single tap. Your wallet keeps every transaction in sync.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      window.dispatchEvent(new CustomEvent('wallet:addFunds'));
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/30 active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Add Funds
                  </button>
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 sm:grid-cols-3">
                {quickStats.map(({ label, value, hint }) => (
                  <QuickStat key={label} label={label} value={value} hint={hint} />
                ))}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 text-right text-white/80">
              {latestActivityDate ? (
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Updated {latestActivityDate}</span>
              ) : (
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">No activity yet</span>
              )}
            </div>
          </div>
        </header>

        <div className="space-y-6 bg-gradient-to-br from-white via-white to-slate-50 p-6">
          <TransactionsPanel
            transactionsQuery={transactionsQuery}
            transactions={transactions}
            currencyDisplay={currencyDisplay}
            resolveLabel={resolveLabel}
            formatDate={formatDate}
            renderTransactionAmount={renderTransactionAmount}
            limit={TRANSACTION_LIMIT}
          />
        </div>
      </div>
    </Modal>
  );
};

export default StudentWalletModal;
