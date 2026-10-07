// Admin / manager API for instructor payout requests.
// Contract: docs/specs/instructor-earnings-payouts.md §2 "Admin / manager".
import apiClient from '@/shared/services/apiClient';

const BASE = '/finances/payout-requests';

export const fetchPayoutRequests = async (status = 'all') => {
  const { data } = await apiClient.get(BASE, { params: { status } });
  return Array.isArray(data) ? data : [];
};

export const fetchPayoutRequestCount = async (status = 'pending') => {
  const { data } = await apiClient.get(`${BASE}/count`, { params: { status } });
  return Number(data?.count) || 0;
};

export const payPayoutRequest = async (id, { amount, paymentMethod, referenceNumber, note }) => {
  const body = { paymentMethod };
  if (amount !== undefined && amount !== null && amount !== '') body.amount = Number(amount);
  if (referenceNumber) body.referenceNumber = referenceNumber;
  if (note) body.note = note;
  const { data } = await apiClient.post(`${BASE}/${id}/pay`, body);
  return data;
};

export const rejectPayoutRequest = async (id, reason) => {
  const { data } = await apiClient.post(`${BASE}/${id}/reject`, { reason });
  return data;
};
