// src/features/manager/services/managerCommissionApi.js
import apiClient from '@/shared/services/apiClient';

/**
 * Manager Commission API Service
 * 
 * Provides API methods for manager commission management
 */

// ============================================
// MANAGER ENDPOINTS (for their own dashboard)
// ============================================

/**
 * Get manager's own commission dashboard
 */
export async function getManagerDashboard(period = null) {
  const params = period ? { period } : {};
  const response = await apiClient.get('/manager/commissions/dashboard', { params });
  return response.data;
}

/**
 * Get manager's commission history (paginated)
 */
export async function getManagerCommissionHistory(options = {}) {
  const { sourceType, status, startDate, endDate, period, page = 1, limit = 20 } = options;
  const params = { page, limit };
  if (sourceType) params.sourceType = sourceType;
  if (status) params.status = status;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (period) params.period = period;
  
  const response = await apiClient.get('/manager/commissions/history', { params });
  return response.data;
}

/**
 * Get manager's commission summary for a period
 */
export async function getManagerCommissionSummary(options = {}) {
  const { startDate, endDate, period } = options;
  const params = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (period) params.period = period;
  
  const response = await apiClient.get('/manager/commissions/summary', { params });
  return response.data;
}

// ============================================
// ADMIN ENDPOINTS (manage all managers)
// ============================================

/**
 * Get all managers with their commission settings
 */
export async function getAllManagersWithSettings() {
  const response = await apiClient.get('/manager/commissions/admin/managers');
  return response.data;
}

/**
 * Get specific manager's commission settings
 */
export async function getManagerSettings(managerId) {
  const response = await apiClient.get(`/manager/commissions/admin/managers/${managerId}/settings`);
  return response.data;
}

/**
 * Update manager's commission settings
 */
export async function updateManagerSettings(managerId, settings) {
  const response = await apiClient.put(`/manager/commissions/admin/managers/${managerId}/settings`, settings);
  return response.data;
}

/**
 * Get manager's commission history (admin view)
 */
export async function getManagerCommissionsAdmin(managerId, options = {}) {
  const { sourceType, status, startDate, endDate, period, page = 1, limit = 20 } = options;
  const params = { page, limit };
  if (sourceType) params.sourceType = sourceType;
  if (status) params.status = status;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (period) params.period = period;
  
  const response = await apiClient.get(`/manager/commissions/admin/managers/${managerId}/commissions`, { params });
  return response.data;
}

/**
 * Get manager's summary (admin view)
 */
export async function getManagerSummaryAdmin(managerId, options = {}) {
  const { startDate, endDate, period } = options;
  const params = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (period) params.period = period;
  
  const response = await apiClient.get(`/manager/commissions/admin/managers/${managerId}/summary`, { params });
  return response.data;
}

export default {
  getManagerDashboard,
  getManagerCommissionHistory,
  getManagerCommissionSummary,
  getAllManagersWithSettings,
  getManagerSettings,
  updateManagerSettings,
  getManagerCommissionsAdmin,
  getManagerSummaryAdmin
};
