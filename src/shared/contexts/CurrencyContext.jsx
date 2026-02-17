// src/shared/contexts/CurrencyContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { App } from 'antd';
import apiClient from '../services/apiClient';
import { useAuth } from '../hooks/useAuth';

const CurrencyContext = createContext();

// Roles that should always see EUR (base currency) for consistency in financial management
const FORCE_BASE_CURRENCY_ROLES = ['admin', 'manager', 'developer', 'instructor'];

// eslint-disable-next-line react-refresh/only-export-components
export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};

export const CurrencyProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const { message } = App.useApp();
  const [currencies, setCurrencies] = useState([]);
  const [baseCurrency, setBaseCurrency] = useState(null);
  const [userCurrency, setUserCurrency] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [exchangeRates, setExchangeRates] = useState({});
  const [businessCurrency, setBusinessCurrency] = useState(null);
  const [businessCurrencyEffectiveFrom, setBusinessCurrencyEffectiveFrom] = useState(null);

  // Load active currencies
  const hasAuthToken = useCallback(() => (
    typeof localStorage !== 'undefined' && !!localStorage.getItem('token')
  ), []);

  const applyPreferredCurrency = (settings, base) => {
    const s = settings || {};
    const pref = s.preferred_currency;
    if (typeof pref === 'string') {
      setBusinessCurrency(pref);
      setBusinessCurrencyEffectiveFrom(null);
      return true;
    }
    if (pref && typeof pref === 'object') {
      const code = pref.code || pref.currency || pref.value;
      if (code) setBusinessCurrency(code);
      setBusinessCurrencyEffectiveFrom(pref.effectiveFrom || pref.effective_from || null);
      return true;
    }
    if (s.defaultCurrency) {
      setBusinessCurrency(s.defaultCurrency);
      return true;
    }
    if (base) {
      setBusinessCurrency(base.currency_code);
      return true;
    }
    return false;
  };

  const loadBusinessCurrency = useCallback(async (base) => {
    // Only attempt to fetch settings when we have an auth token
    if (!hasAuthToken()) {
      if (base) setBusinessCurrency(base.currency_code);
      return;
    }
    try {
      const { data } = await apiClient.get('/settings');
      if (!applyPreferredCurrency(data, base) && base) {
        setBusinessCurrency(base.currency_code);
      }
    } catch {
      // If unauthorized or failing, fall back to base currency without noisy toasts
      if (base) setBusinessCurrency(base.currency_code);
    }
  }, [hasAuthToken]);

  const loadCurrencies = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/currencies/active');
      const data = response.data;
      setCurrencies(data);

      const base = data.find(c => c.base_currency) || null;
      if (base) setBaseCurrency(base);

      const rates = data.reduce((acc, c) => {
        acc[c.currency_code] = c.exchange_rate;
        return acc;
      }, {});
      setExchangeRates(rates);

      // Determine user's display currency based on their role
      // Admin/Manager/Instructor/Developer should always see EUR (base currency)
      // Customers (student/outsider) see their preferred currency
      const userRole = (user?.role || user?.role_name || '').toLowerCase();
      const shouldForceBaseCurrency = FORCE_BASE_CURRENCY_ROLES.includes(userRole);
      
      if (shouldForceBaseCurrency && base) {
        // Staff roles always see base currency (EUR) for consistency
        setUserCurrency(base.currency_code);
      } else {
        // Use the user's registered preferred_currency from their profile
        // This is set during registration and controlled by admin-allowed currencies
        const userRegisteredCurrency = user?.preferred_currency || user?.preferredCurrency;
        if (userRegisteredCurrency && data.find(c => c.currency_code === userRegisteredCurrency)) {
          setUserCurrency(userRegisteredCurrency);
        } else if (base) {
          setUserCurrency(base.currency_code);
        }
      }

      // Fetch business currency only after auth is ready
      if (isAuthenticated || hasAuthToken()) {
        await loadBusinessCurrency(base);
      } else if (base) {
        setBusinessCurrency(base.currency_code);
      }
    } catch (err) {
      // Graceful fallback for 401 (unauthorized) and other failures
      const code = err?.response?.status;
      if (code !== 401) {
        message.error('Failed to load currency settings');
      }
      const fallback = [{ currency_code: 'EUR', symbol: '€', decimal_places: 2, exchange_rate: 1, base_currency: true }];
      setCurrencies((prev) => prev?.length ? prev : fallback);
      setBaseCurrency((prev) => prev || fallback[0]);
      setExchangeRates((prev) => Object.keys(prev || {}).length ? prev : { EUR: 1 });
      setUserCurrency((prev) => prev || 'EUR');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, hasAuthToken, loadBusinessCurrency, message]);

  // Convert amount between currencies
  const convertCurrency = (amount, fromCurrency, toCurrency = userCurrency) => {
    if (!amount || fromCurrency === toCurrency) return amount;
    
    const fromRate = exchangeRates[fromCurrency] || 1;
    const toRate = exchangeRates[toCurrency] || 1;
    
    // Convert to base currency first, then to target currency
    const baseAmount = parseFloat(amount) / parseFloat(fromRate);
    const convertedAmount = baseAmount * parseFloat(toRate);
    
    // Always round UP for customer-facing prices (to never lose money)
    // Use Math.ceil with 2 decimal places
    return Math.ceil(convertedAmount * 100) / 100;
  };

  // Format currency for display
  const formatCurrency = (amount, currencyCode = userCurrency) => {
    const currency = currencies.find(c => c.currency_code === currencyCode);
    const symbol = currency?.symbol || currencyCode;
    const numAmount = parseFloat(amount) || 0;
    const decimalPlaces = currency?.decimal_places || 2;
    
    return `${symbol}${numAmount.toFixed(decimalPlaces).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };

  // Get currency symbol
  const getCurrencySymbol = (currencyCode) => {
    const currency = currencies.find(c => c.currency_code === currencyCode);
    return currency?.symbol || currencyCode;
  };

  // Change user's preferred currency
  // NOTE: This is now a no-op. User currency is controlled by admin-allowed
  // registration currencies. Users cannot change their currency after registration.
  // Kept for backward compatibility but does nothing.
  const changeUserCurrency = (newCurrency) => {
    // No-op: Currency is set from user's registered preferred_currency
    console.warn('changeUserCurrency is deprecated. User currency is determined by registration preference.');
  };

  // Get currency by code
  const getCurrency = (currencyCode) => {
    return currencies.find(c => c.currency_code === currencyCode);
  };

  // Get supported currencies for dropdown
  const getSupportedCurrencies = () => {
    return currencies.map(currency => ({
      label: `${currency.currency_name} (${currency.symbol})`,
      value: currency.currency_code,
      symbol: currency.symbol,
      name: currency.currency_name
    }));
  };

  useEffect(() => {
    loadCurrencies();
  }, [loadCurrencies]);

  // Sync userCurrency when user logs in or user object changes
  useEffect(() => {
    // Check user's role to determine currency display
    const userRole = (user?.role || user?.role_name || '').toLowerCase();
    const shouldForceBaseCurrency = FORCE_BASE_CURRENCY_ROLES.includes(userRole);
    
    if (shouldForceBaseCurrency && baseCurrency) {
      // Staff roles (admin, manager, instructor, developer) always see EUR
      setUserCurrency(baseCurrency.currency_code);
    } else {
      // Customers see their preferred currency
      const userRegisteredCurrency = user?.preferred_currency || user?.preferredCurrency;
      if (userRegisteredCurrency && currencies.length > 0) {
        const validCurrency = currencies.find(c => c.currency_code === userRegisteredCurrency);
        if (validCurrency) {
          setUserCurrency(userRegisteredCurrency);
        }
      }
    }
  }, [user, currencies, baseCurrency]);

  // Expose currencies to window without rendering objects
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__APP_CURRENCY__ = { business: businessCurrency, user: userCurrency };
    }
  }, [businessCurrency, userCurrency]);

  // Helper to check if current user is using forced base currency (staff role)
  const isStaffCurrencyMode = useCallback(() => {
    const userRole = (user?.role || user?.role_name || '').toLowerCase();
    return FORCE_BASE_CURRENCY_ROLES.includes(userRole);
  }, [user]);

  const value = {
    currencies,
    baseCurrency,
    userCurrency,
    loading,
    exchangeRates,
    convertCurrency,
    formatCurrency,
    getCurrencySymbol,
    changeUserCurrency,
    getCurrency,
    getSupportedCurrencies,
    loadCurrencies,
    // Business-level preferred currency (used for future records defaults)
    businessCurrency,
    businessCurrencyEffectiveFrom,
    setBusinessCurrency,
    // Helper to know if user is in staff mode (always EUR)
    isStaffCurrencyMode
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
};
