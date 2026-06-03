import apiClient from '@/shared/services/apiClient';

const BASE_URL = '/proposals';
const PUBLIC_URL = '/public/proposals';

// ── Authed CRUD ─────────────────────────────────────────────────────────────
export const listProposals = async (params = {}) => {
  const { data } = await apiClient.get(BASE_URL, { params });
  return data;
};

export const getProposal = async (id) => {
  const { data } = await apiClient.get(`${BASE_URL}/${id}`);
  return data;
};

export const createProposal = async (payload) => {
  const { data } = await apiClient.post(BASE_URL, payload);
  return data;
};

export const updateProposal = async (id, payload) => {
  const { data } = await apiClient.patch(`${BASE_URL}/${id}`, payload);
  return data;
};

export const duplicateProposal = async (id) => {
  const { data } = await apiClient.post(`${BASE_URL}/${id}/duplicate`);
  return data;
};

export const listTemplates = async () => {
  const { data } = await apiClient.get(`${BASE_URL}/templates`);
  return data;
};

export const saveAsTemplate = async (id, titleSuffix = '') => {
  const { data } = await apiClient.post(`${BASE_URL}/${id}/save-as-template`, { titleSuffix });
  return data;
};

export const sendProposal = async (id) => {
  const { data } = await apiClient.post(`${BASE_URL}/${id}/send`);
  return data;
};

export const deleteProposal = async (id) => {
  const { data } = await apiClient.delete(`${BASE_URL}/${id}`);
  return data;
};

// ── Public (no auth) ────────────────────────────────────────────────────────
export const getPublicProposal = async (code) => {
  const { data } = await apiClient.get(`${PUBLIC_URL}/${code}`);
  return data;
};

export const acceptPublicProposal = async (code) => {
  const { data } = await apiClient.post(`${PUBLIC_URL}/${code}/accept`);
  return data;
};
