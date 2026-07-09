import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchSpotModelSeries } from '../services/windReportService';

/**
 * A raw model's forecast for one spot, fetched only when a non-Mix tab is active (Mix
 * ships in the initial page payload, so it needs no extra request).
 */
export const useSpotModelSeries = (spotId, model, enabled = true) => {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);
  return useQuery({
    queryKey: ['windReport', 'model', spotId, model, lang],
    queryFn: () => fetchSpotModelSeries(spotId, model, { lang }),
    enabled: enabled && !!spotId && !!model && model !== 'mix',
    staleTime: 10 * 60 * 1000,
    keepPreviousData: true,
    refetchOnWindowFocus: false,
    retry: 1,
  });
};
