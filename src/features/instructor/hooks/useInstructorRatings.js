import { useQuery } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';
import { useAuth } from '@/shared/hooks/useAuth';

/**
 * Fetch instructor's own ratings from the API
 * @param {string} instructorId 
 * @param {Object} options 
 * @returns {Promise<Object>}
 */
const fetchInstructorRatings = async (instructorId, { serviceType, limit = 20, offset = 0 } = {}) => {
  if (!instructorId) {
    return { ratings: [], summary: null };
  }
  
  const params = new URLSearchParams();
  if (serviceType) params.append('serviceType', serviceType);
  if (limit) params.append('limit', String(limit));
  if (offset) params.append('offset', String(offset));
  
  const url = `/ratings/instructor/${instructorId}${params.toString() ? `?${params}` : ''}`;
  const { data } = await apiClient.get(url);
  return data;
};

/**
 * Fetch instructor's rating stats
 * @param {string} instructorId 
 * @param {Object} options 
 * @returns {Promise<Object>}
 */
const fetchInstructorRatingStats = async (instructorId, { serviceType } = {}) => {
  if (!instructorId) {
    return { distribution: {} };
  }
  
  const params = new URLSearchParams();
  if (serviceType) params.append('serviceType', serviceType);
  
  const url = `/ratings/stats/${instructorId}${params.toString() ? `?${params}` : ''}`;
  const { data } = await apiClient.get(url);
  return data;
};

/**
 * Hook to fetch instructor's own ratings and statistics
 * @param {Object} options 
 * @returns {Object}
 */
// eslint-disable-next-line complexity
export function useInstructorRatings({ serviceType, limit = 20, offset = 0, enabled = true } = {}) {
  const { user } = useAuth();
  const instructorId = user?.id;

  const ratingsQuery = useQuery({
    queryKey: ['instructor', 'ratings', instructorId, { serviceType, limit, offset }],
    queryFn: () => fetchInstructorRatings(instructorId, { serviceType, limit, offset }),
    enabled: enabled && !!instructorId,
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: false
  });

  const statsQuery = useQuery({
    queryKey: ['instructor', 'rating-stats', instructorId, { serviceType }],
    queryFn: () => fetchInstructorRatingStats(instructorId, { serviceType }),
    enabled: enabled && !!instructorId,
    staleTime: 60_000,
    refetchOnWindowFocus: false
  });

  return {
    ratings: ratingsQuery.data?.ratings ?? [],
    summary: ratingsQuery.data?.summary ?? null,
    stats: statsQuery.data ?? null,
    isLoading: ratingsQuery.isLoading || statsQuery.isLoading,
    isFetching: ratingsQuery.isFetching || statsQuery.isFetching,
    error: ratingsQuery.error || statsQuery.error,
    refetch: () => {
      ratingsQuery.refetch();
      statsQuery.refetch();
    }
  };
}

export default useInstructorRatings;
