/**
 * Authentication utilities for consistent token management
 */

import { getAccessToken } from '../services/apiClient.js';
import { autoLogin } from './autoLogin.js';
import { isTokenValid } from './tokenUtils.js';

export const getAuthToken = () => {
  const token = getAccessToken();
  if (!token) {
    console.error('❌ No authentication token found');
    throw new Error('Authentication required. Please log in.');
  }
  return token;
};

export const getAuthHeaders = async () => {
  try {
    const token = await ensureAuthenticated();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  } catch (error) {
    console.error('❌ Failed to get auth headers:', error.message);
    // If authentication fails, still provide headers but without Authorization
    // This allows the request to proceed and get a proper 401 error from server
    return {
      'Content-Type': 'application/json'
    };
  }
};

export const ensureAuthenticated = async () => {
  const token = getAccessToken();
  
  if (!token || !isTokenValid(token)) {
    console.log('🔐 Token invalid or missing, attempting auto-login...');
    
    // Clear invalid token
    localStorage.removeItem('user');
    
    // Try auto-login first
    try {
      const loginSuccess = await autoLogin();
      
      if (loginSuccess) {
        const newToken = getAccessToken();
        console.log('✅ Auto-login successful, using new token');
        return newToken;
      }
    } catch (error) {
      console.error('❌ Auto-login failed:', error);
    }
    
    // If auto-login failed, throw error instead of redirecting
    throw new Error('Authentication required. Auto-login failed. Please log in manually.');
  }
  
  return token;
};
