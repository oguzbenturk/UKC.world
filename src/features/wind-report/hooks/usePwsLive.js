import { useQuery } from '@tanstack/react-query';
import { fetchPwsLive } from '../services/windReportService';

/**
 * Live reading from UKC's own Weather Underground PWS (Gülbahçe). The backend caches
 * the upstream call for 5 min; we poll every 15 min and on window focus so the "live"
 * number stays fresh without hammering Weather Underground.
 */
export const usePwsLive = () =>
  useQuery({
    queryKey: ['windReport', 'pwsLive'],
    queryFn: fetchPwsLive,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
