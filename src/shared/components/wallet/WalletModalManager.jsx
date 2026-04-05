import { useEffect, useMemo, useState, useCallback } from 'react';
import StudentWalletModal from '@/features/students/components/StudentWalletModal';
import { useAuth } from '@/shared/hooks/useAuth';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { getPreferredCurrency } from '@/features/students/utils/getPreferredCurrency';
import { getWalletBalance } from '@/features/students/utils/getWalletBalance';
import { useQueryClient } from '@tanstack/react-query';
import { useRealTimeSync } from '@/shared/hooks/useRealTime';

const WalletModalManager = () => {
  const { isAuthenticated, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [initialAction, setInitialAction] = useState(null);
  const { userCurrency, getCurrencySymbol, convertCurrency, businessCurrency } = useCurrency();
  const queryClient = useQueryClient();
  
  // Wallet is always stored in EUR (base currency)
  const storageCurrency = businessCurrency || 'EUR';
  const summaryCurrencyCode = storageCurrency; // Query wallet in storage currency
  const { data: walletSummary } = useWalletSummary({ enabled: isAuthenticated, currency: summaryCurrencyCode });

  // When a bank transfer deposit is approved or rejected, invalidate all wallet
  // queries so the balance and transaction list both refresh immediately.
  const invalidateWalletQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['wallet'] });
  }, [queryClient]);

  useRealTimeSync('wallet:deposit_approved', invalidateWalletQueries);
  useRealTimeSync('wallet:deposit_rejected', invalidateWalletQueries);

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    const handleOpen = () => { setInitialAction(null); setOpen(true); };
    const handleClose = () => { setInitialAction(null); setOpen(false); };
    const handleDeposit = () => { setInitialAction('deposit'); setOpen(true); };
    const handleBankTransfer = () => { setInitialAction('bank_transfer'); setOpen(true); };

    window.addEventListener('wallet:open', handleOpen);
    window.addEventListener('studentWallet:open', handleOpen);
    window.addEventListener('wallet:close', handleClose);
    window.addEventListener('wallet:deposit', handleDeposit);
    window.addEventListener('wallet:bank-transfer', handleBankTransfer);

    return () => {
      window.removeEventListener('wallet:open', handleOpen);
      window.removeEventListener('studentWallet:open', handleOpen);
      window.removeEventListener('wallet:close', handleClose);
      window.removeEventListener('wallet:deposit', handleDeposit);
      window.removeEventListener('wallet:bank-transfer', handleBankTransfer);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated && open) {
      setOpen(false);
    }
  }, [isAuthenticated, open]);

  const fallbackCurrency = useMemo(() => (
    userCurrency ? { code: userCurrency, symbol: getCurrencySymbol(userCurrency) } : undefined
  ), [userCurrency, getCurrencySymbol]);

  const currency = useMemo(() => {
    if (!isAuthenticated) {
      return fallbackCurrency;
    }
    return getPreferredCurrency(user, walletSummary, fallbackCurrency);
  }, [isAuthenticated, user, walletSummary, fallbackCurrency]);

  // Balance from wallet — aggregate all currency balances into display currency
  const { rawBalance, rawPending } = useMemo(() => {
    if (!isAuthenticated) {
      return { rawBalance: 0, rawPending: 0 };
    }

    // If the backend returns multi-currency balances, aggregate them
    const balances = walletSummary?.balances;
    if (Array.isArray(balances) && balances.length > 0) {
      let totalAvailable = 0;
      let totalPending = 0;
      for (const b of balances) {
        const avail = Number(b.available) || 0;
        const pend = Number(b.pending) || 0;
        if (avail === 0 && pend === 0) continue;
        if (b.currency === storageCurrency) {
          totalAvailable += avail;
          totalPending += pend;
        } else if (convertCurrency) {
          totalAvailable += convertCurrency(avail, b.currency, storageCurrency);
          totalPending += convertCurrency(pend, b.currency, storageCurrency);
        }
      }
      return { rawBalance: totalAvailable, rawPending: totalPending };
    }

    // Fallback: single-currency response
    if (typeof walletSummary?.available === 'number') {
      return {
        rawBalance: Number(walletSummary.available),
        rawPending: Number(walletSummary.pending) || 0
      };
    }
    const extracted = getWalletBalance(walletSummary, user);
    return {
      rawBalance: typeof extracted === 'number' && Number.isFinite(extracted) ? extracted : 0,
      rawPending: Number(walletSummary?.pending) || 0
    };
  }, [isAuthenticated, walletSummary, user, storageCurrency, convertCurrency]);

  // Convert from storage currency (EUR) to user's display currency
  const displayCurrencyCode = currency?.code || userCurrency || storageCurrency;
  const balance = useMemo(() => {
    if (!isAuthenticated || rawBalance === 0) {
      return 0;
    }
    // Convert from EUR to user's preferred currency for display
    if (convertCurrency && displayCurrencyCode !== storageCurrency) {
      return convertCurrency(rawBalance, storageCurrency, displayCurrencyCode);
    }
    return rawBalance;
  }, [isAuthenticated, rawBalance, convertCurrency, storageCurrency, displayCurrencyCode]);

  const pendingBalance = useMemo(() => {
    if (!isAuthenticated || rawPending === 0) return 0;
    if (convertCurrency && displayCurrencyCode !== storageCurrency) {
      return convertCurrency(rawPending, storageCurrency, displayCurrencyCode);
    }
    return rawPending;
  }, [isAuthenticated, rawPending, convertCurrency, storageCurrency, displayCurrencyCode]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <StudentWalletModal
      open={open}
      onClose={() => { setOpen(false); setInitialAction(null); }}
      currency={currency}
      balance={balance}
      pendingBalance={pendingBalance}
      initialAction={initialAction}
    />
  );
};

export default WalletModalManager;
