// TanStack Query hooks for the instructor earnings page.
import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import realTimeService from '@/shared/services/realTimeService';
import {
  cancelPayoutRequest,
  createPayoutRequest,
  fetchEarningsActivity,
  fetchEarningsSummary,
} from './earningsApi';

export const earningsKeys = {
  all: ['instructor-earnings'],
  summary: (period) => ['instructor-earnings', 'summary', period],
  activity: (params) => ['instructor-earnings', 'activity', params],
};

export const PAYOUT_SOCKET_EVENT = 'payout_request:updated';

export function useEarningsSummary(period) {
  return useQuery({
    queryKey: earningsKeys.summary(period),
    queryFn: () => fetchEarningsSummary(period),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useEarningsActivity({ period, type = 'all', search = '', limit = 50, enabled = true }) {
  const params = { period, type, search, limit, offset: 0 };
  return useQuery({
    queryKey: earningsKeys.activity(params),
    queryFn: () => fetchEarningsActivity(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled,
  });
}

const invalidateEarnings = (queryClient) => queryClient.invalidateQueries({ queryKey: earningsKeys.all });

export function useCreatePayoutRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPayoutRequest,
    onSuccess: () => invalidateEarnings(queryClient),
  });
}

export function useCancelPayoutRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelPayoutRequest,
    onSuccess: () => invalidateEarnings(queryClient),
  });
}

// Refresh everything when the backend reports a payout request change
// (paid / rejected by a manager, or created/cancelled from another device).
export function usePayoutRequestRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const handler = () => invalidateEarnings(queryClient);
    realTimeService.on(PAYOUT_SOCKET_EVENT, handler);
    return () => realTimeService.off(PAYOUT_SOCKET_EVENT, handler);
  }, [queryClient]);
}

const DESKTOP_QUERY = '(min-width: 1024px)';

const readMatch = (query) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return Boolean(window.matchMedia(query)?.matches);
};

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => readMatch(query));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(query);
    if (!mql) return undefined;
    const onChange = (event) => setMatches(Boolean(event.matches));
    setMatches(Boolean(mql.matches));
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener?.(onChange);
    return () => mql.removeListener?.(onChange);
  }, [query]);
  return matches;
}

export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY);
export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');
