import { useEffect, useMemo, useState } from 'react';
import StudentWalletModal from '@/features/students/components/StudentWalletModal';
import { useAuth } from '@/shared/hooks/useAuth';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { getPreferredCurrency } from '@/features/students/utils/getPreferredCurrency';
import { getWalletBalance } from '@/features/students/utils/getWalletBalance';

const WalletModalManager = () => {
  const { isAuthenticated, user } = useAuth();
  const [open, setOpen] = useState(false);
  const { userCurrency, getCurrencySymbol, convertCurrency, businessCurrency } = useCurrency();
  
  // Wallet is always stored in EUR (base currency)
  const storageCurrency = businessCurrency || 'EUR';
  const summaryCurrencyCode = storageCurrency; // Query wallet in storage currency
  const { data: walletSummary } = useWalletSummary({ enabled: isAuthenticated, currency: summaryCurrencyCode });

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    const handleOpen = () => setOpen(true);
    const handleClose = () => setOpen(false);

    window.addEventListener('wallet:open', handleOpen);
    window.addEventListener('studentWallet:open', handleOpen);
    window.addEventListener('wallet:close', handleClose);

    return () => {
      window.removeEventListener('wallet:open', handleOpen);
      window.removeEventListener('studentWallet:open', handleOpen);
      window.removeEventListener('wallet:close', handleClose);
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

  // Balance from wallet is in EUR (storage currency)
  // Convert it to user's display currency
  const rawBalance = useMemo(() => {
    if (!isAuthenticated) {
      return 0;
    }
    if (typeof walletSummary?.available === 'number') {
      return Number(walletSummary.available);
    }
    const extracted = getWalletBalance(walletSummary, user);
    return typeof extracted === 'number' && Number.isFinite(extracted) ? extracted : 0;
  }, [isAuthenticated, walletSummary, user]);

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

  if (!isAuthenticated) {
    return null;
  }

  return (
    <StudentWalletModal
      open={open}
      onClose={() => setOpen(false)}
      currency={currency}
      balance={balance}
    />
  );
};

export default WalletModalManager;
