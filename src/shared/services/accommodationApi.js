import apiClient from './apiClient';

/**
 * Accommodation API Service
 * Handles all accommodation units and bookings related API calls
 */

// ============================================================================
// ACCOMMODATION UNITS (ROOMS)
// ============================================================================

/**
 * Get all accommodation units with optional filters
 */
export const getUnits = async (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.status) queryParams.append('status', params.status);
  if (params.type) queryParams.append('type', params.type);
  if (params.checkIn) queryParams.append('checkIn', params.checkIn);
  if (params.checkOut) queryParams.append('checkOut', params.checkOut);
  if (params.guests) queryParams.append('guests', params.guests);
  if (params.limit) queryParams.append('limit', params.limit);
  if (params.offset) queryParams.append('offset', params.offset);
  
  const query = queryParams.toString();
  const response = await apiClient.get(`/accommodation/units${query ? `?${query}` : ''}`);
  return response.data;
};

/**
 * Get a single unit by ID
 */
export const getUnit = async (id) => {
  const response = await apiClient.get(`/accommodation/units/${id}`);
  return response.data;
};

/**
 * Create a new accommodation unit
 */
export const createUnit = async (unitData) => {
  const response = await apiClient.post('/accommodation/units', unitData);
  return response.data;
};

/**
 * Update an accommodation unit
 */
export const updateUnit = async (id, unitData) => {
  const response = await apiClient.put(`/accommodation/units/${id}`, unitData);
  return response.data;
};

/**
 * Delete an accommodation unit
 */
export const deleteUnit = async (id) => {
  const response = await apiClient.delete(`/accommodation/units/${id}`);
  return response.data;
};

/**
 * Get available unit types
 */
export const getUnitTypes = async () => {
  const response = await apiClient.get('/accommodation/unit-types');
  return response.data;
};

// ============================================================================
// ACCOMMODATION BOOKINGS
// ============================================================================

/**
 * Get all bookings (admin/manager)
 */
export const getBookings = async (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.status) queryParams.append('status', params.status);
  if (params.limit) queryParams.append('limit', params.limit);
  if (params.offset) queryParams.append('offset', params.offset);
  
  const query = queryParams.toString();
  const response = await apiClient.get(`/accommodation/bookings${query ? `?${query}` : ''}`);
  return response.data;
};

/**
 * Get a single booking by ID
 */
export const getBooking = async (id) => {
  const response = await apiClient.get(`/accommodation/bookings/${id}`);
  return response.data;
};

/**
 * Create a new booking
 */
export const createBooking = async (bookingData) => {
  const response = await apiClient.post('/accommodation/bookings', bookingData);
  return response.data;
};

/**
 * Get current user's bookings
 */
export const getMyBookings = async () => {
  const response = await apiClient.get('/accommodation/my-bookings');
  return response.data;
};

/**
 * Confirm a pending booking (admin/manager)
 */
export const confirmBooking = async (id) => {
  const response = await apiClient.patch(`/accommodation/bookings/${id}/confirm`);
  return response.data;
};

/**
 * Complete a booking (admin/manager)
 */
export const completeBooking = async (id) => {
  const response = await apiClient.patch(`/accommodation/bookings/${id}/complete`);
  return response.data;
};

/**
 * Cancel a booking
 */
export const cancelBooking = async (id) => {
  const response = await apiClient.patch(`/accommodation/bookings/${id}/cancel`);
  return response.data;
};

// Export all functions
export const accommodationApi = {
  // Units
  getUnits,
  getUnit,
  createUnit,
  updateUnit,
  deleteUnit,
  getUnitTypes,
  // Bookings
  getBookings,
  getBooking,
  createBooking,
  getMyBookings,
  confirmBooking,
  completeBooking,
  cancelBooking,
};

export default accommodationApi;
