import apiClient from '@/shared/services/apiClient';

const BASE_PATH = '/ratings';

const mapError = (error) => {
  // Handle validation errors array format from express-validator
  if (error?.response?.data?.errors && Array.isArray(error.response.data.errors)) {
    return error.response.data.errors.map(e => e.msg || e.message).join(', ');
  }
  if (error?.response?.data?.error) {
    return error.response.data.error;
  }
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  return error?.message || 'Unexpected error';
};

export const ratingApi = {
  async fetchUnratedBookings({ limit } = {}) {
    try {
      const response = await apiClient.get(`${BASE_PATH}/unrated`, {
        params: limit ? { limit } : undefined
      });
      return response.data?.bookings ?? [];
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  async submitRating(payload) {
    try {
      const response = await apiClient.post(BASE_PATH, payload);
      return response.data;
    } catch (error) {
      throw new Error(mapError(error));
    }
  }
};
