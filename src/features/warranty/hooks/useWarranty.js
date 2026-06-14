import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/warrantyApi';

const KEYS = {
  trackingClaim: (code) => ['warrantyTracking', code],
  staffClaim:    (code) => ['warrantyStaff', code],
  adminClaim:    (id)   => ['warrantyAdminClaim', id],
  adminList:     (params) => ['warrantyAdminList', params],
  adminStats:    ['warrantyAdminStats']
};

export const warrantyKeys = KEYS;

// ─── Public read hooks ───────────────────────────────────────────────────────

export function useTrackingClaim(code, options = {}) {
  return useQuery({
    queryKey: KEYS.trackingClaim(code),
    queryFn: () => api.getTrackingClaim(code),
    enabled: Boolean(code),
    staleTime: 60_000,
    retry: 0,
    ...options
  });
}

export function useStaffClaim(code, options = {}) {
  return useQuery({
    queryKey: KEYS.staffClaim(code),
    queryFn: () => api.getStaffClaim(code),
    enabled: Boolean(code),
    staleTime: 30_000,
    retry: 0,
    ...options
  });
}

// ─── Admin read hooks ────────────────────────────────────────────────────────

export function useAdminWarrantyList(params, options = {}) {
  return useQuery({
    queryKey: KEYS.adminList(params),
    queryFn: () => api.listClaims(params),
    keepPreviousData: true,
    staleTime: 30_000,
    ...options
  });
}

export function useAdminWarrantyStats(options = {}) {
  return useQuery({
    queryKey: KEYS.adminStats,
    queryFn: () => api.getStats(),
    staleTime: 60_000,
    ...options
  });
}

export function useAdminWarrantyClaim(id, options = {}) {
  return useQuery({
    queryKey: KEYS.adminClaim(id),
    queryFn: () => api.getClaim(id),
    enabled: Boolean(id),
    staleTime: 15_000,
    ...options
  });
}

// ─── Admin mutations ─────────────────────────────────────────────────────────

function useInvalidateClaim(claimId) {
  const qc = useQueryClient();
  return () => {
    if (claimId) qc.invalidateQueries({ queryKey: KEYS.adminClaim(claimId) });
    qc.invalidateQueries({ queryKey: ['warrantyAdminList'] });
    qc.invalidateQueries({ queryKey: KEYS.adminStats });
  };
}

export function useUpdateStatus(claimId) {
  const invalidate = useInvalidateClaim(claimId);
  return useMutation({
    mutationFn: (vars) => api.updateStatus(claimId, vars),
    onSuccess: invalidate
  });
}

export function useAddNote(claimId) {
  const invalidate = useInvalidateClaim(claimId);
  return useMutation({
    mutationFn: (vars) => api.addNote(claimId, vars),
    onSuccess: invalidate
  });
}

export function useSendCustomerUpdate(claimId) {
  const invalidate = useInvalidateClaim(claimId);
  return useMutation({
    mutationFn: (vars) => api.sendCustomerUpdate(claimId, vars),
    onSuccess: invalidate
  });
}

export function useResendCustomerLink(claimId) {
  return useMutation({
    mutationFn: () => api.resendCustomerLink(claimId)
  });
}

export function useCloseClaim(claimId) {
  const invalidate = useInvalidateClaim(claimId);
  return useMutation({
    mutationFn: () => api.closeClaim(claimId),
    onSuccess: invalidate
  });
}

export function useDeleteClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteClaim(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['warrantyAdminList'] });
      qc.invalidateQueries({ queryKey: KEYS.adminStats });
      qc.removeQueries({ queryKey: KEYS.adminClaim(id) });
    }
  });
}

export function useDeleteMedia(claimId) {
  const invalidate = useInvalidateClaim(claimId);
  return useMutation({
    mutationFn: (mediaId) => api.deleteMedia(claimId, mediaId),
    onSuccess: invalidate
  });
}

export function useAdminSetClaimNumber(claimId) {
  const invalidate = useInvalidateClaim(claimId);
  return useMutation({
    mutationFn: (claimNumber) => api.setAdminClaimNumber(claimId, claimNumber),
    onSuccess: invalidate
  });
}

export function useCreateStaffLink(claimId) {
  const invalidate = useInvalidateClaim(claimId);
  return useMutation({
    mutationFn: (vars) => api.createStaffLink(claimId, vars),
    onSuccess: invalidate
  });
}

export function useRevokeStaffLink(claimId) {
  const invalidate = useInvalidateClaim(claimId);
  return useMutation({
    mutationFn: (linkId) => api.revokeStaffLink(claimId, linkId),
    onSuccess: invalidate
  });
}

// ─── Upload mutations ────────────────────────────────────────────────────────

export function useSubmitWarrantyClaim() {
  return useMutation({
    mutationFn: ({ formData, onUploadProgress }) =>
      api.submitWarrantyClaim(formData, { onUploadProgress })
  });
}

export function useAdminCreateClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ formData, onUploadProgress }) =>
      api.adminCreateClaim(formData, { onUploadProgress }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warrantyAdminList'] });
      qc.invalidateQueries({ queryKey: KEYS.adminStats });
    }
  });
}

export function useStaffUpload(code) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ formData, onUploadProgress }) =>
      api.uploadStaffFiles(code, formData, { onUploadProgress }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.staffClaim(code) })
  });
}

export function useAdminUpload(claimId) {
  const invalidate = useInvalidateClaim(claimId);
  return useMutation({
    mutationFn: ({ formData, onUploadProgress }) =>
      api.uploadAdminFiles(claimId, formData, { onUploadProgress }),
    onSuccess: invalidate
  });
}

export function useStaffNote(code) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars) => api.postStaffNote(code, vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.staffClaim(code) })
  });
}

export function useStaffStatus(code) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars) => api.setStaffStatus(code, vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.staffClaim(code) })
  });
}

export function useStaffClaimNumber(code) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (claimNumber) => api.setStaffClaimNumber(code, claimNumber),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.staffClaim(code) })
  });
}
