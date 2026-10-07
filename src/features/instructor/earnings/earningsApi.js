// API client for the instructor earnings page + payout requests.
// Contract: docs/specs/instructor-earnings-payouts.md §2 (instructor endpoints).
import apiClient from '@/shared/services/apiClient';

const BASE = '/instructors/me';

export const fetchEarningsSummary = async (period) => {
  const { data } = await apiClient.get(`${BASE}/earnings-summary`, { params: { period } });
  return data;
};

export const fetchEarningsActivity = async ({ period, type = 'all', search = '', limit = 50, offset = 0 }) => {
  const params = { period, type, limit, offset };
  if (search) params.search = search;
  const { data } = await apiClient.get(`${BASE}/earnings-activity`, { params });
  return data;
};

export const fetchPayoutRequests = async () => {
  const { data } = await apiClient.get(`${BASE}/payout-requests`);
  return data;
};

export const createPayoutRequest = async ({ amount, preferredMethod, note }) => {
  const body = { amount };
  if (preferredMethod) body.preferredMethod = preferredMethod;
  if (note) body.note = note;
  const { data } = await apiClient.post(`${BASE}/payout-requests`, body);
  return data;
};

export const cancelPayoutRequest = async (id) => {
  const { data } = await apiClient.delete(`${BASE}/payout-requests/${id}`);
  return data;
};

// Downloads the monthly statement as a file (CSV, or PDF when the backend supports it).
export const downloadEarningsStatement = async ({ month, format = 'csv' }) => {
  const response = await apiClient.get(`${BASE}/earnings-statement`, {
    params: { month, format },
    responseType: 'blob',
  });
  const blob = response.data instanceof Blob
    ? response.data
    : new Blob([response.data], { type: format === 'pdf' ? 'application/pdf' : 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `earnings-statement-${month}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};
