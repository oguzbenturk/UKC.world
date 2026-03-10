/**
 * Auto-login utility for development and testing
 * This ensures authentication is always available
 */

import { getAccessToken, setAccessToken } from '../services/apiClient.js';
import { isTokenValid } from './tokenUtils.js';

export const autoLogin = async () => {
  try {
    // Check if we already have a valid token
    const existingToken = getAccessToken();
    if (existingToken && isTokenValid(existingToken)) {
      console.log('✅ Valid token found, user is already authenticated');
      return true;
    }

    console.log('🔐 No valid token found, attempting auto-login...');

    // Auto-login with admin credentials
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'admin@plannivo.com',
        password: 'password'
      })
    });

    if (!response.ok) {
      console.error('❌ Auto-login failed:', response.status, response.statusText);
      return false;
    }

    const data = await response.json();
    
    if (data.token) {
      setAccessToken(data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      console.log('✅ Auto-login successful, user authenticated');
      return true;
    } else {
      console.error('❌ Auto-login failed: No token received');
      return false;
    }
  } catch (error) {
    console.error('❌ Auto-login error:', error);
    return false;
  }
};

export const ensureAuthenticationWithAutoLogin = async () => {
  const token = getAccessToken();
  
  if (!token || !isTokenValid(token)) {
    console.log('🔄 Token invalid or missing, attempting auto-login...');
    const loginSuccess = await autoLogin();
    
    if (!loginSuccess) {
      throw new Error('Authentication failed. Could not auto-login.');
    }
  }
  
  return getAccessToken();
};

/**
 * Enhanced auto-login with better error handling and retry logic
 */
export const autoLoginWithRetry = async (maxRetries = 3) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔐 Auto-login attempt ${attempt}/${maxRetries}...`);
      
      // Check if we already have a valid token
      const existingToken = getAccessToken();
      if (existingToken && isTokenValid(existingToken)) {
        console.log('✅ Valid token found, user is already authenticated');
        return true;
      }

      // Clear any invalid tokens
      localStorage.removeItem('user');

      console.log('🔐 No valid token found, attempting auto-login...');

      // Auto-login with admin credentials
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'admin@plannivo.com',
          password: 'password'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Login failed: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown error'}`);
      }

      const data = await response.json();
      
      if (data.token && data.user) {
        setAccessToken(data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        console.log(`✅ Auto-login successful on attempt ${attempt}!`);
        return true;
      } else {
        throw new Error('Login response missing token or user data');
      }
      
    } catch (error) {
      lastError = error;
      console.error(`❌ Auto-login attempt ${attempt} failed:`, error.message);
      
      // Wait before retrying (except on last attempt)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * attempt, 5000); // Progressive delay, max 5 seconds
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`❌ Auto-login failed after ${maxRetries} attempts:`, lastError?.message);
  return false;
};
