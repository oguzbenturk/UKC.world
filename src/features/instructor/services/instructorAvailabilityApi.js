import apiClient from '@/shared/services/apiClient';

// ── Instructor self-service ────────────────────────────────────────────────

export const fetchMyAvailability = (params = {}) => {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.from) query.set('from', params.from);
  return apiClient.get(`/instructors/me/availability?${query}`).then((r) => r.data);
};

export const requestTimeOff = (payload) =>
  apiClient.post('/instructors/me/availability', payload).then((r) => r.data);

export const cancelMyTimeOffRequest = (id) =>
  apiClient.delete(`/instructors/me/availability/${id}`).then((r) => r.data);

// ── Batch query ───────────────────────────────────────────────────────────

/**
 * Returns a map: { instructorId: ['YYYY-MM-DD', ...] }
 */
export const fetchUnavailableInstructors = (startDate, endDate) =>
  apiClient
    .get(`/instructors/unavailable?startDate=${startDate}&endDate=${endDate}`)
    .then((r) => r.data);

// ── Admin / manager management ────────────────────────────────────────────

export const fetchInstructorAvailability = (instructorId, params = {}) => {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.from) query.set('from', params.from);
  return apiClient
    .get(`/instructors/${instructorId}/availability?${query}`)
    .then((r) => r.data);
};

export const createInstructorAvailabilityBlock = (instructorId, payload) =>
  apiClient
    .post(`/instructors/${instructorId}/availability`, payload)
    .then((r) => r.data);

export const updateAvailabilityStatus = (instructorId, entryId, status) =>
  apiClient
    .patch(`/instructors/${instructorId}/availability/${entryId}`, { status })
    .then((r) => r.data);

export const deleteInstructorAvailabilityEntry = (instructorId, entryId) =>
  apiClient
    .delete(`/instructors/${instructorId}/availability/${entryId}`)
    .then((r) => r.data);
