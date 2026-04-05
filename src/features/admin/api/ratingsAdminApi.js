import apiClient from '@/shared/services/apiClient';

const BASE_PATH = '/ratings';

const mapError = (error) => {
  if (error?.response?.data?.error) {
    return error.response.data.error;
  }
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  return error?.message || 'Unexpected error';
};

export const ratingsAdminApi = {
  async fetchOverview(params = {}) {
    try {
      const response = await apiClient.get(`${BASE_PATH}/overview`, { params });
      return response.data?.instructors ?? [];
    } catch (error) {
      throw new Error(mapError(error));
    }
  }
};
