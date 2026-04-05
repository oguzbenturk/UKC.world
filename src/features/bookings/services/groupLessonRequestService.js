/**
 * Group Lesson Request Service - Frontend API Client
 */

import apiClient from '@/shared/services/apiClient';

/**
 * Submit a group lesson request (solo student wanting to be matched)
 */
export const createGroupLessonRequest = async (data) => {
  const response = await apiClient.post('/group-lesson-requests', data);
  return response.data;
};

/**
 * Get requests — student sees own, admin/manager sees all
 */
export const getGroupLessonRequests = async (params = {}) => {
  const response = await apiClient.get('/group-lesson-requests', { params });
  return response.data;
};

/**
 * Cancel a request
 */
export const cancelGroupLessonRequest = async (id) => {
  const response = await apiClient.delete(`/group-lesson-requests/${id}`);
  return response.data;
};

/**
 * Match requests into a group booking (admin/manager only)
 */
export const matchGroupLessonRequests = async (data) => {
  const response = await apiClient.post('/group-lesson-requests/match', data);
  return response.data;
};
