import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchAllReports } from '../services/windReportService';

export const useAllReports = () => {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);

  return useQuery({
    queryKey: ['windReport', 'all', lang],
    queryFn: () => fetchAllReports({ lang }),
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
  });
};
