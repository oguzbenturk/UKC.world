// filepath: c:\Users\Ozzy\Desktop\kspro\src\features\bookingCalendar\api\calendarApi.js
import apiClient from '@/shared/services/apiClient';
import { serviceApi } from '@/shared/services/serviceApi';

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
    const response = await apiClient.get('/bookings/available-slots', {
      params: {
        startDate,
        endDate,
        ...filters
      }
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Get all instructors
 * @param {boolean} [activeOnly=true] - Only return active instructors
 * @returns {Promise<Array>} - Array of instructors
 */
export const getInstructors = async (activeOnly = true) => {
  try {
    const response = await apiClient.get('/instructors', {
      params: { 
        active: activeOnly 
      }
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Get all available services (lesson types)
 * @returns {Promise<Array>} - Array of services
 */
export const getServices = async () => {
  try {
    // Use the existing service API
    return await serviceApi.getServices({ type: 'lesson' });
  } catch (error) {
    throw error;
  }
};

/**
 * Book a time slot
 * @param {Object} bookingData - Booking details
 * @param {string} bookingData.date - Date in YYYY-MM-DD format
 * @param {string} bookingData.time - Time in HH:MM format
 * @param {number} bookingData.instructorId - Instructor ID
 * @param {number} bookingData.serviceId - Service ID
 * @param {Object} bookingData.user - User information (with student role)
 * @returns {Promise<Object>} - Booking confirmation
 */
export const bookTimeSlot = async (bookingData) => {
  try {
  const response = await apiClient.post('/bookings', bookingData);
  return response.data;
  } catch (error) {
    throw error;
  }
};
