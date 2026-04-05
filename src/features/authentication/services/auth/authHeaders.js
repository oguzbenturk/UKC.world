// src/services/auth/authHeaders.js

/**
 * Get authentication headers for API requests
 * @returns {Object} headers with authorization token if available
 */
export const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  
  if (token) {
    return {
      'Authorization': `Bearer ${token}`
    };
  }
  
  return {};
};
