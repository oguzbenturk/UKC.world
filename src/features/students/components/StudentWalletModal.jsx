import { useCallback, useEffect, useState } from 'react';
import { Modal, App } from 'antd';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletTransactions } from '@/shared/hooks/useWalletTransactions';
import { useRealTimeSync } from '@/shared/hooks/useRealTime';
import { WalletDepositModal } from '@/features/finances/components/WalletDepositModal';
import { BankTransferModal } from '@/features/finances/components/BankTransferModal';
import PromoCodeInput from '@/shared/components/PromoCodeInput';
import apiClient from '@/shared/services/apiClient';
import { useQueryClient } from '@tanstack/react-query';

const STORAGE_CURRENCY = 'EUR';

/* ── Helpers ── */

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

/* ── Main modal ── */
const TRANSACTION_LIMIT = 5;

const StudentWalletModal = ({ open, onClose, currency, balance, pendingBalance = 0, initialAction }) => {
  const { t } = useTranslation(['student']);
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [depositModalVisible, setDepositModalVisible] = useState(false);
  const [bankTransferModalVisible, setBankTransferModalVisible] = useState(false);
  const [appliedWalletVoucher, setAppliedWalletVoucher] = useState(null);
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const { formatCurrency, convertCurrency, businessCurrency, userCurrency } = useCurrency();

  useEffect(() => {
    if (open && initialAction === 'deposit') setDepositModalVisible(true);
    else if (open && initialAction === 'bank_transfer') setBankTransferModalVisible(true);
  }, [open, initialAction]);

  const storageCurrency = businessCurrency || STORAGE_CURRENCY;
  const transactionsQuery = useWalletTransactions({ enabled: open, limit: TRANSACTION_LIMIT });
  const transactions = Array.isArray(transactionsQuery.data?.results) ? transactionsQuery.data.results : [];

  const numericBalance = typeof balance === 'number' && Number.isFinite(balance) ? balance : 0;
  const numericPending = typeof pendingBalance === 'number' && Number.isFinite(pendingBalance) ? pendingBalance : 0;
  const resolvedCurrencyCode = userCurrency || currency?.code || storageCurrency;
  const showDualCurrency = storageCurrency !== resolvedCurrencyCode && convertCurrency;

  const formattedBalance = showDualCurrency
    ? `${formatCurrency(numericBalance, storageCurrency)} / ${formatCurrency(convertCurrency(numericBalance, storageCurrency, resolvedCurrencyCode), resolvedCurrencyCode)}`
    : formatCurrency(numericBalance, resolvedCurrencyCode);

  const hasPending = numericPending > 0;
  const totalBalance = numericBalance + numericPending;
  const formattedTotal = showDualCurrency
    ? `${formatCurrency(totalBalance, storageCurrency)} / ${formatCurrency(convertCurrency(totalBalance, storageCurrency, resolvedCurrencyCode), resolvedCurrencyCode)}`
    : formatCurrency(totalBalance, resolvedCurrencyCode);

  const isNegative = numericBalance < 0;

  const handleRedeemWalletVoucher = useCallback(async (voucherData) => {
    try {
      const response = await apiClient.post('/vouchers/redeem-wallet', { code: voucherData.code, currency: storageCurrency });
      if (response.data?.success) {
        message.success(response.data.message || 'Wallet credit applied!');
        transactionsQuery.refetch();
        queryClient.invalidateQueries({ queryKey: ['wallet'] });
        setTimeout(() => setAppliedWalletVoucher(null), 2000);
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to redeem voucher');
      setAppliedWalletVoucher(null);
    }
  }, [storageCurrency, message, transactionsQuery, queryClient]);

  const handleDepositSuccess = () => {
    setDepositModalVisible(false);
    transactionsQuery.refetch();
    message.success(t('student:walletModal.depositSuccess'));
  };

  const handleBankTransferSuccess = () => {
    setBankTransferModalVisible(false);
    transactionsQuery.refetch();
    message.success(t('student:walletModal.bankTransferSubmitted'));
  };

  useRealTimeSync('wallet:deposit_approved', useCallback((data) => {
    if (data?.deposit) {
      message.success(t('student:walletModal.depositApproved'));
      transactionsQuery.refetch();
    }
  }, [message, transactionsQuery, t]));

  useRealTimeSync('wallet:deposit_rejected', useCallback((data) => {
    if (data?.deposit) {
      message.warning(t('student:walletModal.depositDeclined'));
      transactionsQuery.refetch();
    }
  }, [message, transactionsQuery, t]));

  const renderTransactionAmount = useCallback(
    (tx) => resolveTransactionAmount(tx, formatCurrency, resolvedCurrencyCode, convertCurrency, storageCurrency),
    [formatCurrency, resolvedCurrencyCode, convertCurrency, storageCurrency],
  );

  const lastTopUp = transactions.find((tx) => tx.direction === 'credit');
  const latestActivity = transactions[0];

  return (<>
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={420}
      centered
      destroyOnHidden
      styles={{
        body: { padding: 0 },
        content: { padding: 0, borderRadius: 16, overflow: 'hidden' },
      }}
    >
      <div className="bg-white">
        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">{t('student:walletModal.title')}</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors text-sm"
              aria-label={t('student:walletModal.close')}
            >
              {t('student:walletModal.close')}
            </button>
          </div>

          {/* Balance */}
          <div>
            <p className="text-xs text-slate-500">
              {hasPending ? t('student:walletModal.totalBalance') : t('student:walletModal.availableBalance')}
            </p>
            <p className={`text-2xl font-bold mt-1 ${isNegative ? 'text-rose-600' : 'text-slate-900'}`}>
              {hasPending ? formattedTotal : formattedBalance}
            </p>
            {hasPending && (
              <div className="flex items-center gap-4 mt-2">
                <span className="text-xs text-emerald-600">
                  {formatCurrency(numericBalance, resolvedCurrencyCode)} {t('student:walletModal.available')}
                </span>
                <span className="text-xs text-amber-600">
                  {formatCurrency(numericPending, resolvedCurrencyCode)} {t('student:walletModal.reserved')}
                </span>
              </div>
            )}
            <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${isNegative ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              {isNegative ? t('student:walletModal.overdue') : t('student:walletModal.active')}
            </span>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="px-6 py-3 border-b border-slate-100 relative">
          <button
            type="button"
            onClick={() => setAddFundsOpen(prev => !prev)}
            className="w-full px-4 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-medium shadow-sm hover:bg-sky-500 transition-colors flex items-center justify-center gap-2"
          >
            {t('student:walletModal.addFunds')}
            <svg className={`h-3.5 w-3.5 transition-transform ${addFundsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {addFundsOpen && (
            <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              <button
                type="button"
                onClick={() => { setAddFundsOpen(false); setDepositModalVisible(true); }}
                className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors border-b border-slate-100"
              >
                {t('student:walletModal.creditCard')}
              </button>
              <button
                type="button"
                onClick={() => { setAddFundsOpen(false); setBankTransferModalVisible(true); }}
                className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {t('student:walletModal.bankTransfer')}
              </button>
            </div>
          )}
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 gap-3 px-6 py-4 border-b border-slate-100">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('student:walletModal.lastTopUp')}</p>
            <p className="text-sm font-medium text-slate-800 mt-1 truncate">
              {lastTopUp ? formatTransactionDate(lastTopUp.transaction_date || lastTopUp.created_at) : t('student:walletModal.noneYet')}
            </p>
            {lastTopUp && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">{resolveTransactionLabel(lastTopUp)}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('student:walletModal.latestActivity')}</p>
            <p className="text-sm font-medium text-slate-800 mt-1 truncate">
              {latestActivity ? resolveTransactionLabel(latestActivity) : t('student:walletModal.noneYet')}
            </p>
            {latestActivity && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {formatTransactionDate(latestActivity.transaction_date || latestActivity.created_at)}
              </p>
            )}
          </div>
        </div>

        {/* ── Promo Code ── */}
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{t('student:walletModal.promoCode')}</p>
          <PromoCodeInput
            context="wallet"
            amount={0}
            currency={storageCurrency}
            variant="light"
            appliedVoucher={appliedWalletVoucher}
            onValidCode={(voucherData) => {
              setAppliedWalletVoucher(voucherData);
              if (voucherData?.discount?.walletCredit > 0) handleRedeemWalletVoucher(voucherData);
            }}
            onClear={() => setAppliedWalletVoucher(null)}
          />
        </div>

        {/* ── Transactions ── */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('student:walletModal.recentTransactions')}</p>
            <span className="text-xs text-slate-400">{t('student:walletModal.lastN', { count: TRANSACTION_LIMIT })}</span>
          </div>

          {transactionsQuery.isLoading ? (
            <div className="py-8 text-center text-sm text-slate-400">{t('student:walletModal.loading')}</div>
          ) : transactionsQuery.isError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {t('student:walletModal.unableToLoadTransactions')}
            </div>
          ) : transactions.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {transactions.map((tx) => {
                const isDebit = tx.direction === 'debit';
                const label = resolveTransactionLabel(tx);
                const hasOriginal = tx.original_currency && tx.original_currency !== tx.currency;
                return (
                  <div key={tx.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {formatTransactionDate(tx.transaction_date || tx.created_at)}
                      </p>
                      {hasOriginal && (
                        <p className="text-xs text-slate-300">{tx.original_amount} {tx.original_currency}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold tabular-nums ${isDebit ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {renderTransactionAmount(tx)}
                      </p>
                      <span className={`text-xs ${isDebit ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {isDebit ? t('student:walletModal.debit') : t('student:walletModal.credit')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500">{t('student:walletModal.noTransactionsYet')}</p>
              <p className="text-xs text-slate-400 mt-1">{t('student:walletModal.noTransactionsDesc')}</p>
            </div>
          )}
        </div>
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
