import { useCallback, useState } from 'react';
import { Modal, Spin, Alert, App, Dropdown } from 'antd';
import { CreditCardOutlined, BankOutlined } from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletTransactions } from '@/shared/hooks/useWalletTransactions';
import { useRealTimeSync } from '@/shared/hooks/useRealTime';
import { WalletDepositModal } from '@/features/finances/components/WalletDepositModal';
import { BankTransferModal } from '@/features/finances/components/BankTransferModal';

const STORAGE_CURRENCY = 'EUR';

// --- helpers ---

const resolveTransactionAmount = (transaction, formatCurrency, displayCurrencyCode, convertCurrency, storageCurrency) => {
  const rawAmount = Number.parseFloat(transaction.amount);
  const signedAmount = transaction.direction === 'debit' ? -rawAmount : rawAmount;
  const normalized = Number.isFinite(signedAmount) ? signedAmount : 0;
  const transactionCurrency = transaction.currency || storageCurrency;
  const status = String(transaction.status || 'completed').toLowerCase();
  const isCompleted = ['completed', 'succeeded', 'paid', 'processed'].includes(status);
  if (isCompleted) return formatCurrency(normalized, transactionCurrency);
  const showDual = transactionCurrency !== displayCurrencyCode && convertCurrency;
  if (showDual) {
    let displayAmount = convertCurrency(Math.abs(normalized), transactionCurrency, displayCurrencyCode);
    displayAmount = normalized < 0 ? -displayAmount : displayAmount;
    return `${formatCurrency(normalized, transactionCurrency)} / ${formatCurrency(displayAmount, displayCurrencyCode)}`;
  }
  return formatCurrency(normalized, transactionCurrency);
};

const resolveTransactionLabel = (transaction) => {
  if (transaction.description) return transaction.description;
  const normalized = String(transaction.transaction_type || '').replace(/_/g, ' ').trim();
  if (!normalized) return 'Wallet activity';
  return normalized.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const formatTransactionDate = (value) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(date);
  } catch { return ''; }
};

// --- Transaction row icon ---
const TxIcon = ({ isDebit, label }) => {
  const initial = label ? label.charAt(0).toUpperCase() : '?';
  const bg = isDebit ? 'bg-red-50' : 'bg-emerald-50';
  const text = isDebit ? 'text-red-500' : 'text-emerald-600';
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold select-none ${bg} ${text}`}>
      {initial}
    </span>
  );
};

// --- Stat mini-card ---
const StatMini = ({ icon, label, value, hint }) => (
  <div className="rounded-xl bg-white p-3 border border-gray-100/80">
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-gray-400 text-[13px]">{icon}</span>
      <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">{label}</p>
    </div>
    <p className="truncate text-[13px] font-semibold text-gray-700 leading-tight">{value}</p>
    {hint && <p className="truncate text-[11px] text-gray-400 mt-0.5 leading-tight">{hint}</p>}
  </div>
);

// --- Transactions list ---
const TransactionsPanel = ({ transactionsQuery, transactions, resolveLabel, formatDate, renderTransactionAmount, limit }) => (
  <div>
    <div className="mb-2.5 flex items-center justify-between">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Recent Transactions</p>
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-semibold text-gray-400 tabular-nums">
        Last {limit}
      </span>
    </div>

    {transactionsQuery.isLoading ? (
      <div className="flex flex-col items-center gap-2 py-8 text-gray-300">
        <Spin size="small" />
        <span className="text-[11px] text-gray-400">Loading...</span>
      </div>
    ) : transactionsQuery.isError ? (
      <Alert type="error" message="Unable to load transactions" showIcon className="!text-xs" />
    ) : transactions.length > 0 ? (
      <div className="flex flex-col divide-y divide-gray-100/80">
        {transactions.map((tx) => {
          const isDebit = tx.direction === 'debit';
          const label = resolveLabel(tx);
          const hasOriginal = tx.original_currency && tx.original_currency !== tx.currency;
          return (
            <div key={tx.id} className="flex items-center gap-2.5 py-2.5">
              <TxIcon isDebit={isDebit} label={label} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-gray-800">{label}</p>
                <p className="text-[11px] text-gray-400">{formatDate(tx.transaction_date || tx.created_at)}</p>
                {hasOriginal && (
                  <p className="text-[10px] text-gray-300">{tx.original_amount} {tx.original_currency}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className={`text-[13px] font-bold tabular-nums ${isDebit ? 'text-red-500' : 'text-emerald-600'}`}>
                  {renderTransactionAmount(tx)}
                </p>
                <span className={`text-[9px] font-semibold uppercase tracking-wide ${isDebit ? 'text-red-400' : 'text-emerald-500'}`}>
                  {isDebit ? 'Debit' : 'Credit'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 py-8">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-gray-300">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
        </svg>
        <p className="text-xs font-medium text-gray-500">No transactions yet</p>
        <p className="text-[11px] text-gray-400">Top-ups and payments will appear here</p>
      </div>
    )}
  </div>
);

// --- Main modal ---
const TRANSACTION_LIMIT = 3;

const StudentWalletModal = ({ open, onClose, currency, balance }) => {
  const { message } = App.useApp();
  const [depositModalVisible, setDepositModalVisible] = useState(false);
  const [bankTransferModalVisible, setBankTransferModalVisible] = useState(false);
  const { formatCurrency, convertCurrency, businessCurrency, userCurrency } = useCurrency();

  const storageCurrency = businessCurrency || STORAGE_CURRENCY;
  const transactionsQuery = useWalletTransactions({ enabled: open, limit: TRANSACTION_LIMIT });

  const numericBalance = typeof balance === 'number' && Number.isFinite(balance) ? balance : 0;
  const resolvedCurrencyCode = userCurrency || currency?.code || storageCurrency;
  const showDualCurrency = storageCurrency !== resolvedCurrencyCode && convertCurrency;
  const convertedBalance = showDualCurrency ? convertCurrency(numericBalance, storageCurrency, resolvedCurrencyCode) : numericBalance;
  const formattedBalance = showDualCurrency
    ? `${formatCurrency(numericBalance, storageCurrency)} / ${formatCurrency(convertedBalance, resolvedCurrencyCode)}`
    : formatCurrency(numericBalance, resolvedCurrencyCode);

  const isNegative = numericBalance < 0;

  const handleDepositSuccess = () => {
    setDepositModalVisible(false);
    transactionsQuery.refetch();
    message.success('Deposit successful! Your wallet has been updated.');
  };

  const handleBankTransferSuccess = () => {
    setBankTransferModalVisible(false);
    transactionsQuery.refetch();
    message.success('Bank transfer request submitted successfully! It will be reviewed by an admin.');
  };

  // Real-time: notify student when deposit is approved or rejected
  useRealTimeSync('wallet:deposit_approved', useCallback((data) => {
    if (data?.deposit) {
      message.success('Your bank transfer deposit has been approved! Your balance has been updated.');
      transactionsQuery.refetch();
    }
  }, [message, transactionsQuery]));

  useRealTimeSync('wallet:deposit_rejected', useCallback((data) => {
    if (data?.deposit) {
      message.warning('Your bank transfer deposit request was declined. Please contact support for details.');
      transactionsQuery.refetch();
    }
  }, [message, transactionsQuery]));

  const addFundsMenu = {
    items: [
      {
        key: 'credit_card',
        label: 'Credit Card',
        icon: <CreditCardOutlined />,
        onClick: () => setDepositModalVisible(true),
      },
      {
        key: 'bank_transfer',
        label: 'Bank Transfer',
        icon: <BankOutlined />,
        onClick: () => setBankTransferModalVisible(true),
      },
    ],
  };

  const transactions = Array.isArray(transactionsQuery.data?.results) ? transactionsQuery.data.results : [];

  const renderTransactionAmount = useCallback(
    (tx) => resolveTransactionAmount(tx, formatCurrency, resolvedCurrencyCode, convertCurrency, storageCurrency),
    [formatCurrency, resolvedCurrencyCode, convertCurrency, storageCurrency]
  );
  const resolveLabel = useCallback((tx) => resolveTransactionLabel(tx), []);
  const formatDate = useCallback((v) => formatTransactionDate(v), []);

  const lastTopUp = transactions.find((tx) => tx.direction === 'credit');
  const latestActivity = transactions[0];

  return (<>
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={400}
      centered
      destroyOnHidden
      styles={{
        body: { padding: 0 },
        content: {
          padding: 0,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.04)',
        },
        mask: { backdropFilter: 'blur(6px)', background: 'rgba(0,0,0,0.2)' },
      }}
    >
      {/* ── Hero ── */}
      <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-5 pt-5 pb-5">
        {/* Close button — top-right, never overlapping */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 transition hover:bg-white/20 hover:text-white cursor-pointer"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Balance row */}
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-5 w-5 text-white">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18-3a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0H3" />
            </svg>
          </div>

          {/* Text */}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">Available Balance</p>
            <p className={`text-xl font-bold leading-tight tracking-tight tabular-nums mt-0.5 ${isNegative ? 'text-red-400' : 'text-white'}`}>
              {formattedBalance}
            </p>
          </div>

          {/* Status pill */}
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shrink-0 self-end mb-0.5"
            style={{
              background: isNegative ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
              color: isNegative ? '#fca5a5' : '#6ee7b7',
            }}
          >
            <span className="h-1 w-1 rounded-full" style={{ background: isNegative ? '#f87171' : '#34d399' }} />
            {isNegative ? 'Overdue' : 'Active'}
          </span>
        </div>

        {/* Add Funds button — inside hero, clear separation from close */}
        <div className="mt-4">
          <Dropdown menu={addFundsMenu} placement="bottomLeft" trigger={['click']}>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-gray-900 shadow-sm transition hover:bg-gray-100 active:scale-[0.97] cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Funds
            </button>
          </Dropdown>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-2 bg-gray-50 px-4 py-3">
        <StatMini
          icon="🕐"
          label="Last Top-up"
          value={lastTopUp ? formatDate(lastTopUp.transaction_date || lastTopUp.created_at) : 'None yet'}
          hint={lastTopUp ? resolveLabel(lastTopUp) : null}
        />
        <StatMini
          icon="⚡"
          label="Latest Activity"
          value={latestActivity ? resolveLabel(latestActivity) : 'None yet'}
          hint={latestActivity ? formatDate(latestActivity.transaction_date || latestActivity.created_at) : null}
        />
      </div>

      {/* ── Transactions ── */}
      <div className="bg-white px-4 pb-4 pt-3">
        <TransactionsPanel
          transactionsQuery={transactionsQuery}
          transactions={transactions}
          resolveLabel={resolveLabel}
          formatDate={formatDate}
          renderTransactionAmount={renderTransactionAmount}
          limit={TRANSACTION_LIMIT}
        />
      </div>
    </Modal>

    <WalletDepositModal
      visible={depositModalVisible}
      onClose={() => setDepositModalVisible(false)}
      onSuccess={handleDepositSuccess}
    />

    <BankTransferModal
      visible={bankTransferModalVisible}
      onClose={() => setBankTransferModalVisible(false)}
      onSuccess={handleBankTransferSuccess}
    />
  </>);
};

export default StudentWalletModal;
