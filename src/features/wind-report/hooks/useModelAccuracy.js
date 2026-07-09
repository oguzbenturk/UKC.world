import { useQuery } from '@tanstack/react-query';
import { fetchModelAccuracy } from '../services/windReportService';

/** Per-model ±kn badges for a spot (only gulbahce has a station; others return []). */
export const useModelAccuracy = (spotId, enabled = true) =>
  useQuery({
    queryKey: ['windReport', 'accuracy', spotId],
    queryFn: () => fetchModelAccuracy(spotId),
    enabled: enabled && !!spotId,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
