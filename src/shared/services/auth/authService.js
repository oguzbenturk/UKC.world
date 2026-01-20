import apiClient from '../apiClient.js';

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
      console.log('AuthService: Attempting login for:', email);
      
      const response = await apiClient.post('/auth/login', {
        email,
        password
      });

      console.log('AuthService: Login successful');
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
      console.log('AuthService: Logging out...');
      
      await apiClient.post('/auth/logout');
      
      // Clear local storage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('lastUserValidation');
      
      console.log('AuthService: Logout successful');
    } catch (error) {
      console.error('AuthService: Logout failed:', error);
      
      // Even if logout fails on server, clear local storage
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
      console.log('AuthService: Attempting registration...');
      
      const response = await apiClient.post('/auth/register', userData);
      
      console.log('AuthService: Registration successful');
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
      console.log('AuthService: Refreshing token...');
      
      const response = await apiClient.post('/auth/refresh-token');
      
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        console.log('AuthService: New token stored');
      }
      
      if (response.data.user) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
        console.log('AuthService: User data updated, new role:', response.data.user.role);
      }
      
      console.log('AuthService: Token refreshed successfully');
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
      console.log('AuthService: Requesting password reset for:', email);
      
      const response = await apiClient.post('/auth/forgot-password', { email });
      
      console.log('AuthService: Password reset requested successfully');
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
      console.log('AuthService: Resetting password...');
      
      const response = await apiClient.post('/auth/reset-password', {
        token,
        password: newPassword
      });
      
      console.log('AuthService: Password reset successful');
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
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
