import apiClient from './apiClient';

export const walletApi = {
  async fetchSummary(params = {}) {
    const { data } = await apiClient.get('/wallet/summary', { params });
    return data;
  },
  async fetchTransactions(params = {}) {
    const { data } = await apiClient.get('/wallet/transactions', { params });
    return data;
  },
  // Staff with earnings (instructor / manager): earned / paid out / spent / deducted.
  async fetchEarningsActivity(params = {}) {
    const { data } = await apiClient.get('/wallet/earnings-activity', { params });
    return data;
  },
};

export default walletApi;
