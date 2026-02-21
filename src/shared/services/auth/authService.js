import apiClient, { clearAccessToken, getAccessToken, setAccessToken } from '../apiClient.js';

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
      const response = await apiClient.post('/auth/login', {
        email,
        password
      });

      return response.data;
    } catch (error) {
      console.error('AuthService: Login failed:', error);
      
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
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
        throw new Error('Authentication failed');
      } else if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      } else if (error.networkError) {
        throw new Error(error.networkMessage);
      } else {
        throw new Error('Failed to get user information');
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
      
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
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
