import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext_PRODUCTION';

export function useSafeAuth() {
  try {
    const context = useContext(AuthContext);
    
    // If context is null or undefined, return a safe fallback
    if (!context) {
      console.warn('useSafeAuth: AuthContext not available');
      return {
        user: null,
        isAuthenticated: false,
        loading: false,
        error: 'Auth context not available',
        login: async () => ({ error: 'Auth not available' }),
        logout: async () => {},
        setUser: () => {},
        setError: () => {},
        setLoading: () => {}
      };
    }
    
    return context;
  } catch (error) {
    console.error('useSafeAuth: Error accessing AuthContext:', error);
    return {
      user: null,
      isAuthenticated: false,
      loading: false,
      error: 'Auth context error',
      login: async () => ({ error: 'Auth not available' }),
      logout: async () => {},
      setUser: () => {},
      setError: () => {},
      setLoading: () => {}
    };
  }
}
