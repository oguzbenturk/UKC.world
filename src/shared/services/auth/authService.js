import apiClient, { clearAccessToken, getAccessToken, setAccessToken } from '../apiClient.js';

/** Shown when DISABLE_LOGIN blocks password sign-in (avoid harsh “invalid password” UX). */
export const SIGN_IN_DISABLED_USER_MESSAGE =
  'Sign-in is currently disabled. Please check back soon.';

/** Shown when DISABLE_LOGIN blocks public registration. */
export const REGISTRATION_DISABLED_USER_MESSAGE =
  'New account registration is currently disabled. Please check back soon.';

function apiErrorText(error) {
  const data = error.response?.data;
  if (!data || typeof data !== 'object') return null;
  return data.message || data.error || null;
}

/**
 * Authentication Service
 * Simplified version for production stability
 */
class AuthService {
  /**
   * Login user with email and password
   */
  async login(email, password) {
    try {
      // Ensure a CSRF cookie exists before the POST (bootstrap for fresh sessions)
      if (!document.cookie.includes('csrf_token=')) {
        await apiClient.get('/auth/csrf');
      }
      const response = await apiClient.post('/auth/login', {
        email,
        password
      });

      return response.data;
    } catch (error) {
      console.error('AuthService: Login failed:', error);

      if (error.response?.data?.code === 'LOGIN_DISABLED') {
        throw new Error(SIGN_IN_DISABLED_USER_MESSAGE);
      }

      const text = apiErrorText(error);
      if (text) {
        throw new Error(text);
      } else if (error.isAuthError) {
        throw new Error(error.authMessage);
      } else if (error.networkError) {
        throw new Error(error.networkMessage);
      } else {
        throw new Error('Login failed. Please try again.');
      }
    }
  }

  /**
   * Get current user information
   */
  async getCurrentUser() {
    try {
      const response = await apiClient.get('/auth/me');
      return response.data;
    } catch (error) {
      
      if (error.response?.status === 401) {
        const err = new Error('Authentication failed');
        err.isAuthError = true;
        err.statusCode = 401;
        throw err;
      } else if (error.response?.data?.message) {
        const err = new Error(error.response.data.message);
        err.isAuthError = true;
        err.statusCode = error.response.status;
        throw err;
      } else if (error.networkError) {
        const err = new Error(error.networkMessage);
        err.isNetworkError = true;
        throw err;
      } else {
        const err = new Error('Failed to get user information');
        err.isNetworkError = true;
        throw err;
      }
    }
  }

  /**
   * Logout user
   */
  async logout() {
    try {
      await apiClient.post('/auth/logout');
      
      // Clear local storage
      clearAccessToken();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('lastUserValidation');
    } catch (error) {
      // Even if logout fails on server, clear local storage
      clearAccessToken();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('lastUserValidation');
    }
  }

  /**
   * Register new user
   */
  async register(userData) {
    try {
      const response = await apiClient.post('/auth/register', userData);
      
      return response.data;
    } catch (error) {
      console.error('AuthService: Registration failed:', error);

      if (error.response?.data?.code === 'LOGIN_DISABLED') {
        throw new Error(REGISTRATION_DISABLED_USER_MESSAGE);
      }

      const text = apiErrorText(error);
      if (text) {
        throw new Error(text);
      } else if (error.networkError) {
        throw new Error(error.networkMessage);
      } else {
        throw new Error('Registration failed. Please try again.');
      }
    }
  }

  /**
   * Refresh authentication token
   * Gets a new JWT with the current role from the database
   * Essential after role changes (e.g., outsider → student upgrade)
   */
  async refreshToken() {
    try {
      const response = await apiClient.post('/auth/refresh-token');
      
      if (response.data.token) {
        setAccessToken(response.data.token);
      }
      
      if (response.data.user) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
      
      return response.data;
    } catch (error) {
      console.error('AuthService: Token refresh failed:', error);
      throw error;
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email) {
    try {
      const response = await apiClient.post('/auth/forgot-password', { email });
      
      return response.data;
    } catch (error) {
      console.error('AuthService: Password reset request failed:', error);
      
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      } else {
        throw new Error('Failed to request password reset');
      }
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(token, newPassword) {
    try {
      const response = await apiClient.post('/auth/reset-password', {
        token,
        password: newPassword
      });
      
      return response.data;
    } catch (error) {
      console.error('AuthService: Password reset failed:', error);
      
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      } else {
        throw new Error('Failed to reset password');
      }
    }
  }
}

// Export singleton instance
const authService = new AuthService();

// Expose apiClient for components that need direct access
authService.apiClient = apiClient;

export default authService;

/**
 * Helper function to get auth headers
 */
export function getAuthHeaders() {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
