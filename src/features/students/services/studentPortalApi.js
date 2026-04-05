import apiClient from '@/shared/services/apiClient';

const BASE_PATH = '/student';

const mapError = (error) => {
  if (error?.response?.data?.error) {
    return error.response.data.error;
  }
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  return error?.message || 'Unexpected error';
};

export const studentPortalApi = {
  async fetchDashboard() {
    try {
      const response = await apiClient.get(`${BASE_PATH}/dashboard`);
      return response.data;
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  async fetchSchedule(params = {}) {
    try {
      const response = await apiClient.get(`${BASE_PATH}/schedule`, { params });
      return response.data;
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  async updateBooking(bookingId, payload) {
    try {
      const response = await apiClient.patch(`${BASE_PATH}/bookings/${bookingId}`, payload);
      return response.data;
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  async fetchCourses() {
    try {
      const response = await apiClient.get(`${BASE_PATH}/courses`);
      return response.data;
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  async fetchCourseResources(courseId) {
    try {
      const response = await apiClient.get(`${BASE_PATH}/resources/${courseId}`);
      return response.data;
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  async fetchInvoices(params = {}) {
    try {
      const response = await apiClient.get(`${BASE_PATH}/invoices`, { params });
      return response.data;
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  async submitSupportRequest(payload) {
    try {
      const response = await apiClient.post(`${BASE_PATH}/support/request`, payload);
      return response.data;
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  async fetchProfile() {
    try {
      const response = await apiClient.get(`${BASE_PATH}/profile`);
      return response.data;
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  async updateProfile(payload) {
    try {
      const response = await apiClient.put(`${BASE_PATH}/profile`, payload);
      return response.data;
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  async fetchPreferences() {
    try {
      const response = await apiClient.get(`${BASE_PATH}/preferences`);
      return response.data;
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  async updatePreferences(payload) {
    try {
      const response = await apiClient.put(`${BASE_PATH}/preferences`, payload);
      return response.data;
    } catch (error) {
      throw new Error(mapError(error));
    }
  },

  async fetchRecommendations() {
    try {
      const response = await apiClient.get(`${BASE_PATH}/recommendations`);
      return response.data;
    } catch (error) {
      throw new Error(mapError(error));
    }
  }
};
