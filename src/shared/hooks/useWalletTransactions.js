import { useQuery } from '@tanstack/react-query';
import { walletApi } from '../services/walletApi';

const buildQueryKey = ({ currency, limit, offset, status, transactionType }) => [
  'wallet',
  'transactions',
  {
    currency: currency || 'default',
    limit: limit ?? 10,
    offset: offset ?? 0,
    status: status || null,
    transactionType: transactionType || null,
  },
];

export const useWalletTransactions = ({
  currency,
  limit = 10,
  offset = 0,
  status,
  transactionType,
  enabled = true,
  ...queryOptions
} = {}) => {
  const params = {
    currency,
    limit,
    offset,
  };

  if (status) {
    params.status = status;
  }

  if (transactionType) {
    params.transactionType = transactionType;
  }

  return useQuery({
    queryKey: buildQueryKey({ currency, limit, offset, status, transactionType }),
    queryFn: () => walletApi.fetchTransactions(params),
    enabled,
    staleTime: 15_000,
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

export default useWalletTransactions;
