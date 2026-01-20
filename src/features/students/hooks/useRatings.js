import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ratingApi } from '../services/ratingApi';

const ratingQueryKeys = {
  unrated: (limit) => ['student-ratings', 'unrated', limit ?? 'default']
};

export const useUnratedBookings = ({ limit } = {}) => {
  const query = useQuery({
    queryKey: ratingQueryKeys.unrated(limit),
    queryFn: () => ratingApi.fetchUnratedBookings({ limit }),
    staleTime: 60_000,
    cacheTime: 5 * 60_000
  });

  const data = useMemo(() => query.data ?? [], [query.data]);

  return { ...query, data };
};

export const useSubmitRating = ({ onSuccess } = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ratingApi.submitRating,
    onSuccess: async (result, variables, context) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['student-portal', 'dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['student-ratings'] })
      ]);

      if (onSuccess) {
        onSuccess(result, variables, context);
      }
    }
  });
};
