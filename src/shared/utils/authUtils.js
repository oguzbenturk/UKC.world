/**
 * Authentication utilities for consistent token management
 */

import { getAccessToken } from '../services/apiClient.js';

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

export const isTokenValid = (token) => {
  if (!token) return false;
  
  try {
    // For JWT tokens, decode and check expiration
    const base64Url = token.split('.')[1];
    if (!base64Url) return false;
    
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    
    const { exp } = JSON.parse(jsonPayload);
    return exp * 1000 > Date.now();
  } catch (e) {
    console.error('Error checking token validity:', e);
    return false;
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
      const { autoLogin } = await import('./autoLogin.js');
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
