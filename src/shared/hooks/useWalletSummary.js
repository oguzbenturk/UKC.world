import { useQuery } from '@tanstack/react-query';
import { walletApi } from '../services/walletApi';
import { useAuth } from '@/shared/hooks/useAuth';

const queryKey = (userId, currency) => ['wallet', 'summary', userId || 'anonymous', currency || 'default'];

export const useWalletSummary = ({ currency, enabled = true, ...queryOptions } = {}) => {
  const { user } = useAuth();
  const userId = user?.id;
  
  return useQuery({
    queryKey: queryKey(userId, currency),
    queryFn: () => walletApi.fetchSummary({ currency }),
    enabled: enabled && !!userId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (error?.response?.status === 401) {
        return false;
      }
      return failureCount < 2;
    },
    ...queryOptions,
  });
};

export default useWalletSummary;
