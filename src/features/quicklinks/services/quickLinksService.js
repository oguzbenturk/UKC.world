import apiClient from '@/shared/services/apiClient';

const BASE_URL = '/quick-links';

/**
 * Get all quick links with optional filters
 * @param {Object} params - Query parameters
 * @returns {Promise<Array>}
 */
export const getQuickLinks = async (params = {}) => {
  const response = await apiClient.get(BASE_URL, { params });
  return response.data;
};

/**
 * Get quick link statistics
 * @returns {Promise<Object>}
 */
export const getStatistics = async () => {
  const response = await apiClient.get(`${BASE_URL}/statistics`);
  return response.data;
};

/**
 * Get a single quick link by ID
 * @param {number} id
 * @returns {Promise<Object>}
 */
export const getQuickLinkById = async (id) => {
  const response = await apiClient.get(`${BASE_URL}/${id}`);
  return response.data;
};

/**
 * Create a new quick link
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export const createQuickLink = async (data) => {
  const response = await apiClient.post(BASE_URL, data);
  return response.data;
};

/**
 * Update a quick link
 * @param {number} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export const updateQuickLink = async (id, data) => {
  const response = await apiClient.patch(`${BASE_URL}/${id}`, data);
  return response.data;
};

/**
 * Delete a quick link
 * @param {number} id
 * @returns {Promise<Object>}
 */
export const deleteQuickLink = async (id) => {
  const response = await apiClient.delete(`${BASE_URL}/${id}`);
  return response.data;
};

/**
 * Get registrations for a quick link
 * @param {number} quickLinkId
 * @returns {Promise<Array>}
 */
export const getRegistrations = async (quickLinkId) => {
  const response = await apiClient.get(`${BASE_URL}/${quickLinkId}/registrations`);
  return response.data;
};

/**
 * Update a registration status
 * @param {number} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export const updateRegistration = async (id, data) => {
  const response = await apiClient.patch(`${BASE_URL}/registrations/${id}`, data);
  return response.data;
};

/**
 * Delete a registration
 * @param {number} id
 * @returns {Promise<Object>}
 */
export const deleteRegistration = async (id) => {
  const response = await apiClient.delete(`${BASE_URL}/registrations/${id}`);
  return response.data;
};

/**
 * Create user account from registration (admin action)
 * @param {number} registrationId
 * @returns {Promise<Object>}
 */
export const createAccountFromRegistration = async (registrationId) => {
  const response = await apiClient.post(`${BASE_URL}/registrations/${registrationId}/create-account`);
  return response.data;
};

// ============================================
// PUBLIC API (No auth required)
// ============================================

/**
 * Get quick link details by code (public)
 * @param {string} code
 * @returns {Promise<Object>}
 */
export const getPublicQuickLink = async (code) => {
  const response = await apiClient.get(`${BASE_URL}/public/${code}`);
  return response.data;
};

/**
 * Register via quick link (public)
 * @param {string} code
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export const registerViaQuickLink = async (code, data) => {
  const response = await apiClient.post(`${BASE_URL}/public/${code}/register`, data);
  return response.data;
};
