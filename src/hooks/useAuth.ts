import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { getAuthToken } from '../services/secureStorage';
import { apiClient } from '../api/client';
import { User } from '../types';

export function useAuth() {
  const { user, token, isAuthenticated, isLoading, consentRequired, setAuth, logout, setLoading, setConsentRequired } = useAuthStore();

  // On mount: restore session from SecureStore
  useEffect(() => {
    async function restoreSession() {
      try {
        const storedToken = await getAuthToken();
        if (!storedToken) {
          setLoading(false);
          return;
        }
        // Validate token with /auth/me
        const { data } = await apiClient.get<{ user: User; consentRequired?: boolean }>('/auth/me');
        await setAuth(data.user, storedToken);
        if (data.consentRequired) {
          setConsentRequired(true);
        }
      } catch {
        // Token invalid or expired — clear it
        await logout();
      } finally {
        setLoading(false);
      }
    }
    restoreSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    user,
    token,
    isAuthenticated,
    isLoading,
    consentRequired,
    setAuth,
    logout,
    setConsentRequired,
  };
}
