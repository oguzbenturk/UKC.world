import { useQuery } from '@tanstack/react-query';
import { fetchPwsHistory } from '../services/windReportService';

/**
 * Recorded history for UKC's live PWS (Gülbahçe), keyed by range so the sparkline
 * ('24h') and the range-toggle card share/cache independently. Polls every 5 min so a
 * freshly-recorded reading shows up soon after the backend cron writes it.
 * @param {'6h'|'24h'|'7d'} range
 */
export const usePwsHistory = (range = '24h') =>
  useQuery({
    queryKey: ['windReport', 'pwsHistory', range],
    queryFn: () => fetchPwsHistory(range),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    keepPreviousData: true,
    retry: 1,
  });
