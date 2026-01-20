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
};

export default walletApi;
