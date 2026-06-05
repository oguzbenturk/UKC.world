import { useQuery } from '@tanstack/react-query';
import { fetchUkcLive } from '../services/windReportService';

/**
 * Live reading from UKC's own Windguru station (Gülbahçe). The backend caches the
 * upstream call for 5 min; we poll every 15 min and on window focus so the "live"
 * number stays fresh without hammering Windguru.
 */
export const useUkcLive = () =>
  useQuery({
    queryKey: ['windReport', 'ukcLive'],
    queryFn: fetchUkcLive,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
