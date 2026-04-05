import { create } from 'zustand';
import { User } from '../types';
import { saveAuthToken, clearAuthToken } from '../services/secureStorage';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  consentRequired: boolean;
  setAuth: (user: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setConsentRequired: (required: boolean) => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  consentRequired: false,

  setAuth: async (user, token) => {
    await saveAuthToken(token);
    set({ user, token, isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    await clearAuthToken();
    set({ user: null, token: null, isAuthenticated: false, consentRequired: false });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setConsentRequired: (required) => set({ consentRequired: required }),

  updateUser: (updates) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    })),
}));
