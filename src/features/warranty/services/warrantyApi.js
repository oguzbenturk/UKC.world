import apiClient from '@/shared/services/apiClient';

// Public submit may include a 500 MB video — push the per-request timeout
// well above the apiClient default (30s). 30 minutes is generous for any
// realistic connection while still failing fast for true hangs.
const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

// ─── Public — submission ─────────────────────────────────────────────────────

export async function submitWarrantyClaim(formData, { onUploadProgress } = {}) {
  const { data } = await apiClient.post('/public/warranty', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: UPLOAD_TIMEOUT_MS,
    onUploadProgress
  });
  return data;
}

// ─── Public — customer tracking ──────────────────────────────────────────────

export async function getTrackingClaim(code) {
  const { data } = await apiClient.get(`/public/warranty/track/${encodeURIComponent(code)}`);
  return data;
}

export function customerMediaUrl(code, mediaId) {
  const base = apiClient.defaults.baseURL || '/api';
  return `${base}/public/warranty/track/${encodeURIComponent(code)}/media/${encodeURIComponent(mediaId)}`;
}

// ─── Public — staff portal ───────────────────────────────────────────────────

export async function getStaffClaim(code) {
  const { data } = await apiClient.get(`/public/warranty/staff/${encodeURIComponent(code)}`);
  return data;
}

export function staffMediaUrl(code, mediaId) {
  const base = apiClient.defaults.baseURL || '/api';
  return `${base}/public/warranty/staff/${encodeURIComponent(code)}/media/${encodeURIComponent(mediaId)}`;
}

export async function postStaffNote(code, { body, visibleToCustomer }) {
  const { data } = await apiClient.post(`/public/warranty/staff/${encodeURIComponent(code)}/note`, {
    body,
    visible_to_customer: Boolean(visibleToCustomer)
  });
  return data;
}

export async function uploadStaffFiles(code, formData, { onUploadProgress } = {}) {
  const { data } = await apiClient.post(`/public/warranty/staff/${encodeURIComponent(code)}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: UPLOAD_TIMEOUT_MS,
    onUploadProgress
  });
  return data;
}

export async function setStaffClaimNumber(code, claimNumber) {
  const { data } = await apiClient.patch(`/public/warranty/staff/${encodeURIComponent(code)}/claim-number`, {
    claim_number_external: claimNumber
  });
  return data;
}

export async function setStaffStatus(code, { status, note }) {
  const { data } = await apiClient.patch(`/public/warranty/staff/${encodeURIComponent(code)}/status`, {
    status,
    note
  });
  return data;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function adminCreateClaim(formData, { onUploadProgress } = {}) {
  const { data } = await apiClient.post('/warranty/admin', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: UPLOAD_TIMEOUT_MS,
    onUploadProgress
  });
  return data;
}

export async function listClaims(params = {}) {
  const { data } = await apiClient.get('/warranty/admin', { params });
  return data;
}

export async function getStats() {
  const { data } = await apiClient.get('/warranty/admin/stats');
  return data;
}

export async function getClaim(id) {
  const { data } = await apiClient.get(`/warranty/admin/${encodeURIComponent(id)}`);
  return data;
}

export async function updateStatus(id, { status, note } = {}) {
  const { data } = await apiClient.patch(`/warranty/admin/${encodeURIComponent(id)}/status`, {
    status, note
  });
  return data;
}

export async function addNote(id, { body, visibleToCustomer }) {
  const { data } = await apiClient.post(`/warranty/admin/${encodeURIComponent(id)}/notes`, {
    body,
    visible_to_customer: Boolean(visibleToCustomer)
  });
  return data;
}

export async function sendCustomerUpdate(id, { body }) {
  const { data } = await apiClient.post(`/warranty/admin/${encodeURIComponent(id)}/customer-update`, {
    body
  });
  return data;
}

export async function resendCustomerLink(id) {
  const { data } = await apiClient.post(`/warranty/admin/${encodeURIComponent(id)}/resend-customer-link`);
  return data;
}

export async function closeClaim(id) {
  const { data } = await apiClient.post(`/warranty/admin/${encodeURIComponent(id)}/close`);
  return data;
}

export async function deleteClaim(id) {
  const { data } = await apiClient.delete(`/warranty/admin/${encodeURIComponent(id)}`);
  return data;
}

export async function deleteMedia(id, mediaId) {
  const { data } = await apiClient.delete(`/warranty/admin/${encodeURIComponent(id)}/media/${encodeURIComponent(mediaId)}`);
  return data;
}

export async function createStaffLink(id, { staffName, staffEmail, staffUserId }) {
  const { data } = await apiClient.post(`/warranty/admin/${encodeURIComponent(id)}/staff-links`, {
    staff_name: staffName,
    staff_email: staffEmail,
    staff_user_id: staffUserId || undefined
  });
  return data;
}

export async function revokeStaffLink(id, linkId) {
  const { data } = await apiClient.delete(`/warranty/admin/${encodeURIComponent(id)}/staff-links/${encodeURIComponent(linkId)}`);
  return data;
}
