// src/contexts/AuthContext.jsx
import { createContext, useState, useEffect, useRef, useCallback } from 'react';
import authService, { SIGN_IN_DISABLED_USER_MESSAGE } from '../services/auth/authService';
import consentService from '../services/consentService.js';
import apiClient, { clearAccessToken, setAccessToken, getAccessToken, onTokenChange } from '../services/apiClient.js';
import { AuthContext } from './authContextInstance.js';

// eslint-disable-next-line
export { AuthContext };

// Decode a JWT's exp/iat (seconds) without a dependency. Returns null on any error.
const decodeJwtExp = (token) => {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return { exp: json.exp, iat: json.iat };
  } catch {
    return null;
  }
};

// Delay (ms) until the next proactive refresh: ~60% of the token's real lifetime,
// clamped to [15s, 6h]. Falls back to 20min when exp/iat can't be read.
const computeRefreshDelayMs = (token) => {
  const decoded = decodeJwtExp(token);
  let delayMs;
  if (decoded?.exp && decoded?.iat) {
    const lifetimeMs = (decoded.exp - decoded.iat) * 1000;
    delayMs = decoded.iat * 1000 + lifetimeMs * 0.6 - Date.now();
  } else {
    delayMs = 20 * 60 * 1000;
  }
  return Math.min(Math.max(delayMs, 15 * 1000), 6 * 60 * 60 * 1000);
};

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
  const [familyGroup, setFamilyGroup] = useState(null);
  const authCheckRef = useRef(false);
  const refreshTimerRef = useRef(null);
  const lastProactiveRef = useRef(0);
  const refreshFailRef = useRef(0);
  const refreshGenRef = useRef(0);

  const refreshFamilyGroup = useCallback(async (userId) => {
    if (!userId) {
      setFamilyGroup(null);
      return null;
    }
    try {
      const res = await apiClient.get(`/family-groups/by-user/${userId}`);
      const group = res?.data?.data ?? null;
      setFamilyGroup(group);
      return group;
    } catch {
      setFamilyGroup(null);
      return null;
    }
  }, []);
  
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

      // Skip the network call entirely if there's no token — user is definitely a guest
      const hasToken = getAccessToken() || localStorage.getItem('token');
      if (!hasToken) {
        resetAuthState();
        setLoading(false);
        authCheckRef.current = false;
        return;
      }

      try {
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
        } catch (err) {
          if (err?.isNetworkError) {
            // Network error (offline/timeout) — use localStorage for offline resilience
            const fallbackSuccessful = hydrateFromStoredUser();
            if (!fallbackSuccessful) {
              localStorage.removeItem('user');
              clearAccessToken();
              resetAuthState();
            }
          } else {
            // Server explicitly rejected the token (401 or other auth error)
            // Do NOT fall back to stale localStorage — clear everything
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            clearAccessToken();
            resetAuthState();
          }
        }
      } catch {
        setError('Authentication check failed. Please try again.');
        localStorage.removeItem('user');
        clearAccessToken();
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

        setAccessToken(result.token);
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
      if (errorMessage === SIGN_IN_DISABLED_USER_MESSAGE || e?.code === 'EMAIL_NOT_VERIFIED') {
        throw e;
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);

      const rememberedEmail = localStorage.getItem('rememberedEmail');

      await authService.logout();
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

  // Proactively renew the session BEFORE the access token expires, so the always-on
  // /music screen never hits a 401. Uses the refresh-token cookie via apiClient and
  // NEVER forces a logout on failure — only the reactive apiClient 401 path does.
  const silentRefresh = useCallback(async () => {
    try {
      const data = await authService.refreshToken();
      if (data?.token) {
        const normalizedUser = data.user ? { ...data.user } : null;
        if (normalizedUser) {
          if (data.consent) normalizedUser.consent = data.consent;
          setUser(normalizedUser);
          try { localStorage.setItem('user', JSON.stringify(normalizedUser)); } catch { /* ignore */ }
          if (data.consent) applyConsent(data.consent, { syncUser: false });
          window.dispatchEvent(new CustomEvent('auth:userUpdated', { detail: { user: normalizedUser } }));
        }
        lastProactiveRef.current = Date.now();
        return data;
      }
      return null;
    } catch {
      // Transient failure (e.g. a network blip) must not log the kiosk out.
      return null;
    }
  }, [applyConsent]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    const token = getAccessToken() || localStorage.getItem('token');
    if (!token) return;

    // Generation guard: a successful refresh fires notifyTokenChange synchronously,
    // which re-enters scheduleRefresh via the onTokenChange listener. Bumping the
    // generation invalidates any in-flight tick so we never end up with two
    // overlapping timer chains (which would double every cycle into a refresh storm).
    const myGen = ++refreshGenRef.current;

    // Self-rescheduling tick. On success: reset the failure counter and schedule the
    // next refresh at ~60% of the new token's lifetime. On failure: if the access
    // token is already dead, stop (the reactive 401 path owns the logout); otherwise
    // retry with capped exponential backoff so a network outage can't cause a tight
    // retry loop for the rest of the token's life.
    const tick = async () => {
      if (myGen !== refreshGenRef.current) return; // superseded by a newer schedule
      const result = await silentRefresh();
      if (myGen !== refreshGenRef.current) return; // superseded while awaiting
      if (result) {
        refreshFailRef.current = 0;
        const next = getAccessToken() || localStorage.getItem('token');
        if (next) refreshTimerRef.current = setTimeout(tick, computeRefreshDelayMs(next));
        return;
      }
      const current = getAccessToken() || localStorage.getItem('token');
      const dec = current ? decodeJwtExp(current) : null;
      const stillValid = dec?.exp ? dec.exp * 1000 > Date.now() : false;
      if (!stillValid) return;
      refreshFailRef.current += 1;
      const backoffMs = Math.min(30 * 1000 * (2 ** (refreshFailRef.current - 1)), 10 * 60 * 1000);
      refreshTimerRef.current = setTimeout(tick, backoffMs);
    };

    refreshTimerRef.current = setTimeout(tick, computeRefreshDelayMs(token));
  }, [silentRefresh]);

  // Start/stop the proactive refresh timer with the session, and reschedule whenever
  // the token changes (e.g. the reactive 401 path minted a new one).
  useEffect(() => {
    if (!isAuthenticated) {
      refreshGenRef.current++; // invalidate any in-flight tick
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return undefined;
    }
    scheduleRefresh();
    const unsubscribe = onTokenChange(() => scheduleRefresh());
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      refreshGenRef.current++; // invalidate any in-flight tick on teardown/logout
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [isAuthenticated, scheduleRefresh]);

  // Recover on wake: a screen that slept/backgrounded may have a near-expired token.
  // Refresh on focus / visibility / reconnect, and adopt a token another tab minted.
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const maybeRefresh = () => {
      if (Date.now() - lastProactiveRef.current < 60 * 1000) return; // debounce bursts
      const token = getAccessToken() || localStorage.getItem('token');
      const decoded = token ? decodeJwtExp(token) : null;
      if (!decoded?.exp) return;
      const msLeft = decoded.exp * 1000 - Date.now();
      if (msLeft < 5 * 60 * 1000) {
        silentRefresh().then(() => scheduleRefresh());
      }
    };
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') maybeRefresh();
    };
    const onStorage = (e) => {
      if (e.key === 'token' && e.newValue) {
        setAccessToken(e.newValue); // adopt a token refreshed by another tab
        scheduleRefresh();
      }
    };

    window.addEventListener('focus', maybeRefresh);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', maybeRefresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('focus', maybeRefresh);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', maybeRefresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [isAuthenticated, silentRefresh, scheduleRefresh]);

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
    if (!isAuthenticated || !user?.id) {
      setFamilyGroup(null);
      return;
    }
    refreshFamilyGroup(user.id);
  }, [isAuthenticated, user?.id, refreshFamilyGroup]);

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
    familyGroup,
    refreshFamilyGroup,
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
