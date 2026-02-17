// filepath: c:\Users\Ozzy\Desktop\kspro\src\features\bookingCalendar\api\calendarApi.js
import apiClient from '@/shared/services/apiClient';
import { getAuthHeaders } from '@/shared/services/auth/authService';
import { serviceApi } from '@/shared/services/serviceApi';
import { retryApiCall } from '@/shared/utils/retryUtils';

export const CalendarApiErrors = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  NOT_FOUND: 'NOT_FOUND'
};

const validateResponse = (data) => {
  if (!data) throw new Error(CalendarApiErrors.VALIDATION_ERROR);
  return data;
};

// Helper function to validate slot data
const validateSlotData = (data) => {
  if (!Array.isArray(data)) {
    throw new Error('Invalid response format: expected array of days');
  }
    data.forEach(day => {
    if (!day.date || !Array.isArray(day.slots)) {
      throw new Error('Invalid day data format');
    }
    
    day.slots.forEach(slot => {
      if (!slot.time || !slot.status || !slot.instructorId) {
        throw new Error('Invalid slot data format');
      }
    });
  });
  
  return data;
};

// Helper function to handle API errors
const handleApiError = (error) => {
  if (error.response) {
    // Server responded with error
    switch (error.response.status) {
      case 400:
        throw { type: CalendarApiErrors.VALIDATION_ERROR, message: error.response.data.error || 'Invalid request' };
      case 401:
      case 403:
        throw { type: CalendarApiErrors.AUTH_ERROR, message: 'Authentication required' };
      default:
        throw { type: CalendarApiErrors.SERVER_ERROR, message: error.response.data.error || 'Server error' };
    }
  } else if (error.request) {
    // Request made but no response
    throw { type: CalendarApiErrors.NETWORK_ERROR, message: 'Network error' };
  } else {
    // Something else
    throw { type: CalendarApiErrors.SERVER_ERROR, message: error.message };
  }
};

/**
 * Get available slots for a specific date range
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {Object} filters - Optional filters
 * @param {number[]} [filters.instructorIds] - Filter by instructor IDs
 * @param {number[]} [filters.serviceIds] - Filter by service IDs
 * @returns {Promise<Array>} - Array of day schedules
 */
export const getAvailableSlots = async (startDate, endDate, filters = {}) => {
  try {
    // Validate input dates
    if (!startDate || !endDate) {
      throw { type: CalendarApiErrors.VALIDATION_ERROR, message: 'Start and end dates are required' };
    }    const response = await retryApiCall(() => apiClient.get('/bookings/available-slots', {
      params: {
        startDate,
        endDate,
        ...filters
      }
    }));
    
    // Validate response data
    return validateSlotData(response.data);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Fetch available slots for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} - Available slots for the date
 */
export const fetchAvailableSlots = async (date) => {
  try {
    const response = await apiClient.get('/bookings/available-slots', {
      params: { date }
    });

    if (!response.data) {
      throw new Error(CalendarApiErrors.VALIDATION_ERROR);
    }

    return response.data;
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get all instructors
 * @param {boolean} [activeOnly=true] - Only return active instructors
 * @returns {Promise<Array>} - Array of instructors
 */
export const getInstructors = async (activeOnly = true) => {
  try {    const response = await retryApiCall(() => apiClient.get('/instructors', {
      params: { 
        active: activeOnly 
      }
    }));
    
    // Validate instructor data
    if (!Array.isArray(response.data)) {
      throw new Error('Invalid response format: expected array of instructors');
    }
    
    return response.data;
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get all available services (lesson types)
 * @returns {Promise<Array>} - Array of services
 */
export const getServices = async () => {
  try {
    const services = await retryApiCall(() => serviceApi.getServices({ type: 'lesson' }));
    
    // Validate service data
    if (!Array.isArray(services)) {
      throw new Error('Invalid response format: expected array of services');
    }
    
    return services;
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Book a time slot
 * @param {Object} bookingData - Booking details
 * @param {string} bookingData.date - Date in YYYY-MM-DD format
 * @param {string} bookingData.time - Time in HH:MM format
 * @param {number} bookingData.instructorId - Instructor ID
 * @param {number} bookingData.serviceId - Service ID
 * @param {Object} bookingData.user - User information (any role)
 * @returns {Promise<Object>} - Booking confirmation
 */
export const bookTimeSlot = async (bookingData) => {
  try {
    // Validate booking data
    if (!bookingData.date || !bookingData.time || !bookingData.instructorId || !bookingData.serviceId) {
      throw { type: CalendarApiErrors.VALIDATION_ERROR, message: 'Missing required booking information' };
    }
    
    if (!bookingData.user || !bookingData.user.name || !bookingData.user.email) {
      throw { type: CalendarApiErrors.VALIDATION_ERROR, message: 'Missing required user information' };
    }
    
    const response = await apiClient.post('/bookings/calendar', bookingData);
    
    // Validate booking response
    if (!response.data) {
      throw new Error('Empty booking response');
    }
    
    // Return a standardized response format
    return {
      success: true,
      bookingId: response.data.id || response.data.bookingId || `temp-${Date.now()}`,
      ...response.data
    };
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Create a booking
 * @param {Object} bookingData - Booking details
 * @returns {Promise<Object>} - Booking confirmation
 */
export const createBooking = async (bookingData) => {
  try {
    const response = await apiClient.post('/bookings/calendar', bookingData);

    if (!response.data) {
      throw new Error(CalendarApiErrors.VALIDATION_ERROR);
    }

    return response.data;
  } catch (error) {
    return handleApiError(error);
  }
};
