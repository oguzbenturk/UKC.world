import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import realTimeService from '@/shared/services/realTimeService';
import {
  fetchPayoutRequestCount,
  fetchPayoutRequests,
  payPayoutRequest,
  rejectPayoutRequest,
} from '../services/payoutRequestsApi';

export const PAYOUT_REQUESTS_KEY = ['payout-requests'];
export const PAYOUT_REQUESTS_COUNT_KEY = ['payout-requests', 'count'];
const SOCKET_EVENT = 'payout_request:updated';

/** Refresh every payout-request query when the backend emits payout_request:updated. */
export function usePayoutRequestsRealtime(enabled = true) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return undefined;
    const handler = () => queryClient.invalidateQueries({ queryKey: PAYOUT_REQUESTS_KEY });
    realTimeService.on(SOCKET_EVENT, handler);
    return () => realTimeService.off(SOCKET_EVENT, handler);
  }, [enabled, queryClient]);
}

export function usePayoutRequestCount({ enabled = true } = {}) {
  usePayoutRequestsRealtime(enabled);
  const { data = 0 } = useQuery({
    queryKey: PAYOUT_REQUESTS_COUNT_KEY,
    queryFn: () => fetchPayoutRequestCount('pending'),
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 120_000 : false,
    retry: false,
  });
  return data;
}

export function usePayoutRequestList(status = 'all', { enabled = true } = {}) {
  usePayoutRequestsRealtime(enabled);
  return useQuery({
    queryKey: [...PAYOUT_REQUESTS_KEY, 'list', status],
    queryFn: () => fetchPayoutRequests(status),
    enabled,
    staleTime: 10_000,
  });
}

export function usePayoutRequestActions() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: PAYOUT_REQUESTS_KEY });
    // Instructor balances / payroll views read the same ledger.
    queryClient.invalidateQueries({ queryKey: ['instructors'] });
  };
  const pay = useMutation({
    mutationFn: ({ id, ...payload }) => payPayoutRequest(id, payload),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }) => rejectPayoutRequest(id, reason),
    onSuccess: invalidate,
  });
  return { pay, reject };
}
