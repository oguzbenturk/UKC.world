// src/contexts/AuthContext.jsx
import { createContext, useState, useEffect, useRef, useCallback } from 'react';
import authService from '../services/auth/authService';
import consentService from '../services/consentService.js';

// eslint-disable-next-line
export const AuthContext = createContext(null);

const DEFAULT_CONSENT = {
  latestTermsVersion: 'current',
  termsVersion: null,
  termsAcceptedAt: null,
  requiresTermsAcceptance: true,
  communicationPreferences: {
    email: false,
    sms: false,
    whatsapp: false
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [consent, setConsent] = useState(null);
  const [consentLoading, setConsentLoading] = useState(false);
  const authCheckRef = useRef(false);
  
  // Helper to determine if current state is guest mode
  // Guest = not authenticated but also not loading
  const isGuest = !isAuthenticated && !loading;

  const coerceConsent = useCallback((incoming) => {
    if (!incoming) {
      return { ...DEFAULT_CONSENT };
    }

    const latestTermsVersion = incoming.latestTermsVersion || incoming.termsVersion || DEFAULT_CONSENT.latestTermsVersion;
    const termsVersion = incoming.termsVersion ?? null;
    const termsAcceptedAt = incoming.termsAcceptedAt ?? null;
    const communicationPreferences = {
      email: !!incoming.communicationPreferences?.email,
      sms: !!incoming.communicationPreferences?.sms,
      whatsapp: !!incoming.communicationPreferences?.whatsapp
    };

    const requiresTermsAcceptance = incoming.requiresTermsAcceptance ?? (!termsAcceptedAt || (termsVersion && latestTermsVersion && termsVersion !== latestTermsVersion));

    const result = {
      latestTermsVersion,
      termsVersion,
      termsAcceptedAt,
      requiresTermsAcceptance,
      communicationPreferences
    };

    return result;
  }, []);

  const applyConsent = useCallback((nextConsent, { syncUser = true } = {}) => {
    const normalizedConsent = coerceConsent(nextConsent);
    setConsent(normalizedConsent);

    if (syncUser) {
      setUser((prev) => {
        if (!prev) {
          return prev;
        }
        return { ...prev, consent: normalizedConsent };
      });
    }

    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          parsed.consent = normalizedConsent;
          localStorage.setItem('user', JSON.stringify(parsed));
        }
      }
    } catch {
      // ignore storage sync
    }
  }, [coerceConsent]);

  const applyConsentRef = useRef(applyConsent);

  useEffect(() => {
    applyConsentRef.current = applyConsent;
  }, [applyConsent]);

  useEffect(() => {
    const handleForceReset = () => {
      setLoading(false);
      setError(null);
      authCheckRef.current = false;
    };

    const handleGlobalError = (event) => {
      const { error: globalError } = event.detail;
      if (globalError?.message?.includes('auth') || globalError?.message?.includes('token')) {
        setError('Authentication error occurred');
        setLoading(false);
      }
    };

    const handleSessionExpire = () => {
      setUser(null);
      setIsAuthenticated(false);
      setError(null);
      setLoading(false);
      applyConsentRef.current?.(null);
    };

    const handleUserUpdated = (e) => {
      const updated = e.detail?.user;
      if (!updated?.id) {
        return;
      }

      setUser((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));

      try {
        const stored = localStorage.getItem('user');
        if (!stored) {
          return;
        }

        const parsed = JSON.parse(stored);
        if (!parsed || parsed.id !== updated.id) {
          return;
        }

        const merged = { ...parsed, ...updated };
        if (parsed.consent && !merged.consent) {
          merged.consent = parsed.consent;
        }
        localStorage.setItem('user', JSON.stringify(merged));
      } catch {}
    };

    window.addEventListener('forceLoadingReset', handleForceReset);
    window.addEventListener('globalError', handleGlobalError);
    window.addEventListener('sessionExpired', handleSessionExpire);
    window.addEventListener('auth:userUpdated', handleUserUpdated);

    return () => {
      window.removeEventListener('forceLoadingReset', handleForceReset);
      window.removeEventListener('globalError', handleGlobalError);
      window.removeEventListener('sessionExpired', handleSessionExpire);
      window.removeEventListener('auth:userUpdated', handleUserUpdated);
    };
  }, []);

  const isTokenValid = (token) => {
    if (!token) return false;

    try {
      const base64Url = token.split('.')[1];
      if (!base64Url) return false;

      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`)
          .join('')
      );

      const { exp } = JSON.parse(jsonPayload);
      return exp * 1000 > Date.now();
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const resetAuthState = () => {
      setUser(null);
      applyConsentRef.current?.(null);
      setIsAuthenticated(false);
    };

    const hydrateFromStoredUser = () => {
      const storedUser = localStorage.getItem('user');
      if (!storedUser) {
        return false;
      }

      try {
        const parsedUser = JSON.parse(storedUser);
        if (!parsedUser) {
          return false;
        }

  setUser(parsedUser);
  applyConsentRef.current?.(parsedUser.consent ?? null, { syncUser: false });
        setIsAuthenticated(true);
        return true;
      } catch {
        localStorage.removeItem('user');
        return false;
      }
    };

    const checkAuth = async () => {
      if (authCheckRef.current) {
        return;
      }

      authCheckRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem('token');

        if (!token) {
          resetAuthState();
          return;
        }

        if (!isTokenValid(token)) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          resetAuthState();
          return;
        }

        try {
          const userData = await authService.getCurrentUser();
          const normalizedUser = userData ? { ...userData } : null;
          setUser(normalizedUser);
          // Update localStorage with fresh user data (includes permissions)
          if (normalizedUser) {
            localStorage.setItem('user', JSON.stringify(normalizedUser));
          }
          applyConsentRef.current?.(userData?.consent ?? null, { syncUser: false });
          setIsAuthenticated(true);
        } catch {
          const fallbackSuccessful = hydrateFromStoredUser();
          if (!fallbackSuccessful) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            resetAuthState();
          }
        }
      } catch {
        setError('Authentication check failed. Please try again.');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        resetAuthState();
      } finally {
        setLoading(false);
        authCheckRef.current = false;
      }
    };

    const timeoutId = setTimeout(() => {
      if (authCheckRef.current) {
        setLoading(false);
        authCheckRef.current = false;
        setError('Authentication check timed out. Please refresh the page.');
      }
    }, 10000);

    checkAuth().finally(() => {
      clearTimeout(timeoutId);
    });

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

  const login = async (email, password) => {
    try {
      setLoading(true);
      setError(null);

      const result = await authService.login(email, password);

      if (result.token) {
        const consentData = result.consent ?? result.user?.consent ?? null;
        const userData = {
          ...result.user,
          role: result.user.role || result.user.role_name,
        };

        if (consentData) {
          userData.consent = consentData;
        }

        localStorage.setItem('token', result.token);
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        applyConsent(consentData, { syncUser: false });
        setIsAuthenticated(true);
        return true;
      }

      setError('Login failed: No token received');
      applyConsent(null);
      return false;
    } catch (e) {
      const errorMessage = e?.message || 'Login failed. Please check your credentials.';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);

      const rememberedEmail = localStorage.getItem('rememberedEmail');

      authService.logout();
      setUser(null);
      setIsAuthenticated(false);
      setError(null);
      applyConsent(null);

      if (rememberedEmail) {
        localStorage.setItem('rememberedEmail', rememberedEmail);
      }
    } catch {
      setError('Logout failed.');
    } finally {
      setLoading(false);
    }
  };

  const refreshConsent = async () => {
    if (!isAuthenticated) {
      return null;
    }

    setConsentLoading(true);
    try {
      const status = await consentService.getStatus();
      applyConsent(status);
      return status;
    } finally {
      setConsentLoading(false);
    }
  };

  /**
   * Refresh user data from the server
   * Useful after actions that may change user state (e.g., role upgrade)
   */
  const refreshUser = async () => {
    if (!isAuthenticated) {
      return null;
    }

    try {
      const userData = await authService.getCurrentUser();
      if (userData) {
        const normalizedUser = { ...userData };
        setUser(normalizedUser);
        
        // Update localStorage
        localStorage.setItem('user', JSON.stringify(normalizedUser));
        
        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('auth:userUpdated', { 
          detail: { user: normalizedUser } 
        }));
        
        return normalizedUser;
      }
      return null;
    } catch (refreshError) {
      console.error('Failed to refresh user:', refreshError);
      return null;
    }
  };

  /**
   * Refresh authentication token from the server
   * This gets a new JWT with the current role from the database
   * Essential after role changes (e.g., outsider → student upgrade)
   */
  const refreshToken = async () => {
    if (!isAuthenticated) {
      return null;
    }

    try {
      const response = await authService.refreshToken();
      if (response?.token && response?.user) {
        // Update token
        localStorage.setItem('token', response.token);
        
        // Update user data
        const normalizedUser = { ...response.user };
        if (response.consent) {
          normalizedUser.consent = response.consent;
        }
        
        setUser(normalizedUser);
        localStorage.setItem('user', JSON.stringify(normalizedUser));
        
        // Update consent if available
        if (response.consent) {
          applyConsent(response.consent, { syncUser: false });
        }
        
        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('auth:userUpdated', { 
          detail: { user: normalizedUser } 
        }));
        
        console.log('Token refreshed, new role:', normalizedUser.role);
        return normalizedUser;
      }
      return null;
    } catch (refreshError) {
      console.error('Failed to refresh token:', refreshError);
      return null;
    }
  };

  const updateConsent = async (updates) => {
    setConsentLoading(true);
    try {
      const status = await consentService.updateStatus(updates);
      applyConsent(status);
      return status;
    } catch (errorUpdate) {
      throw errorUpdate;
    } finally {
      setConsentLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || consentLoading || consent) {
      return;
    }

    let cancelled = false;

    const ensureConsent = async () => {
      setConsentLoading(true);
      try {
        const status = await consentService.getStatus();
        if (!cancelled) {
          applyConsentRef.current?.(status);
        }
      } catch {
        if (!cancelled) {
          setError('We could not refresh your consent status. Please try again later.');
        }
      } finally {
        if (!cancelled) {
          setConsentLoading(false);
        }
      }
    };

    ensureConsent();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, consent, consentLoading]);

  const clearError = () => {
    setError(null);
  };

  const value = {
    user,
    isAuthenticated,
    isGuest,
    loading,
    error,
    consent,
    consentLoading,
    requiresConsent: isAuthenticated && (consent?.requiresTermsAcceptance ?? true),
    login,
    logout,
    clearError,
    refreshConsent,
    refreshUser,
    refreshToken,
    updateConsent,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
