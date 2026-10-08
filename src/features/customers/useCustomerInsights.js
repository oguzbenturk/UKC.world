// TanStack Query hooks for the staff Customers page.
//   GET /users/customers/segments                  → segment tiles + chip counts
//   GET /users/customers/list?insights=1&withTotal=1 → keyset-paged list with real total
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';

export const customerKeys = {
  all: ['customers-overview'],
  segments: () => ['customers-overview', 'segments'],
  list: (params) => ['customers-overview', 'list', params],
};

export const CUSTOMER_FILTERS = ['all', 'lessons', 'shop', 'members', 'rentals', 'stays', 'owes', 'credit', 'new'];
export const CUSTOMER_ACTIVITY = ['any', 'active', 'inactive'];

// UI sort key → server sortBy + sortDir.
export const CUSTOMER_SORTS = {
  spend: { sortBy: 'lifetime_spend', sortDir: 'desc' },
  recent: { sortBy: 'last_activity', sortDir: 'desc' },
  name: { sortBy: 'name', sortDir: 'asc' },
  owes: { sortBy: 'balance', sortDir: 'asc' },
  newest: { sortBy: 'created_at', sortDir: 'desc' },
};

export const PAGE_SIZE = 50;

export function useCustomerSegments() {
  return useQuery({
    queryKey: customerKeys.segments(),
    queryFn: async () => (await apiClient.get('/users/customers/segments')).data,
    staleTime: 60_000,
  });
}

export function useCustomerList({ segment = 'all', activity = 'any', q = '', sort = 'spend' } = {}) {
  const params = { segment, activity, q, sort };
  return useInfiniteQuery({
    queryKey: customerKeys.list(params),
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const { sortBy, sortDir } = CUSTOMER_SORTS[sort] || CUSTOMER_SORTS.spend;
      const query = {
        insights: 1,
        withTotal: pageParam ? undefined : 1,
        limit: PAGE_SIZE,
        sortBy,
        sortDir,
        ...(segment !== 'all' ? { segment } : {}),
        ...(activity !== 'any' ? { activity } : {}),
        ...(q ? { q } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      };
      return (await apiClient.get('/users/customers/list', { params: query })).data;
    },
    getNextPageParam: (last) => last?.nextCursor || undefined,
    staleTime: 30_000,
  });
}

export function useInvalidateCustomers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: customerKeys.all });
}
