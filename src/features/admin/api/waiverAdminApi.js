import apiClient from '@/shared/services/apiClient';

const BASE_PATH = '/admin/waivers';

const extractValidationError = (error) => {
  const validationErrors = error?.response?.data?.errors;
  if (!Array.isArray(validationErrors) || validationErrors.length === 0) {
    return null;
  }
  return validationErrors
    .map((item) => item?.msg || item?.message)
    .filter(Boolean)
    .join('; ');
};

const extractErrorMessage = (error) => {
  const validationMessage = extractValidationError(error);
  if (validationMessage) {
    return validationMessage;
  }
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  if (error?.response?.data?.error) {
    return error.response.data.error;
  }
  return error?.message || 'An unexpected error occurred while communicating with the waiver API';
};

const buildParams = (params = {}) => Object.fromEntries(
  Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
);

export const waiverAdminApi = {
  async list(params = {}) {
    try {
      const { data } = await apiClient.get(BASE_PATH, { params: buildParams(params) });
      return data;
    } catch (error) {
      throw new Error(extractErrorMessage(error));
    }
  },

  async stats(params = {}) {
    try {
      const { data } = await apiClient.get(`${BASE_PATH}/stats`, { params: buildParams(params) });
      return data?.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error));
    }
  },

  async exportCsv(params = {}) {
    try {
      const response = await apiClient.get(`${BASE_PATH}/export`, {
        params: buildParams(params),
        responseType: 'blob'
      });
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error));
    }
  },

  async detail(subjectId, type) {
    if (!subjectId || !type) {
      throw new Error('subjectId and type are required to fetch waiver details');
    }

    try {
      const { data } = await apiClient.get(`${BASE_PATH}/subjects/${subjectId}`, {
        params: buildParams({ type })
      });
      return data?.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error));
    }
  }
};

export default waiverAdminApi;
