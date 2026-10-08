// TanStack Query hooks for the staff Members page.
// Query keys keep the 'admin-member-purchases' / 'admin-member-stats' prefixes that
// NewMemberDrawer and the other member screens already invalidate after a sale.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';

export const memberKeys = {
  purchases: () => ['admin-member-purchases', 'all'],
  stats: () => ['admin-member-stats', 'overview'],
};

export function useMemberPurchases() {
  return useQuery({
    queryKey: memberKeys.purchases(),
    queryFn: async () => (await apiClient.get('/member-offerings/admin/purchases')).data || [],
    staleTime: 60_000,
  });
}

export function useMemberStats() {
  return useQuery({
    queryKey: memberKeys.stats(),
    queryFn: async () => (await apiClient.get('/member-offerings/admin/stats')).data,
    staleTime: 60_000,
  });
}

export function useInvalidateMembers() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['admin-member-purchases'] });
    queryClient.invalidateQueries({ queryKey: ['admin-member-stats'] });
  };
}

/** POST /member-offerings/admin/purchases/remind → { requested, sent, skipped } */
export function useSendRenewalReminders() {
  return useMutation({
    mutationFn: async (purchaseIds) => (await apiClient.post('/member-offerings/admin/purchases/remind', { purchaseIds })).data,
  });
}
