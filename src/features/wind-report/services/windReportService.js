import apiClient from '@/shared/services/apiClient';

export const fetchSpots = async () => {
  const { data } = await apiClient.get('/weather/spots');
  return data.spots;
};

export const fetchSpotReport = async (spotId, { lang } = {}) => {
  const params = {};
  if (lang) params.lang = lang;
  const { data } = await apiClient.get(`/weather/report/${spotId}`, { params });
  return data;
};

export const fetchAllReports = async ({ lang } = {}) => {
  const params = {};
  if (lang) params.lang = lang;
  const { data } = await apiClient.get('/weather/report', { params });
  return data;
};

/** UKC's own live Windguru station (current measured conditions at Gülbahçe). */
export const fetchUkcLive = async () => {
  const { data } = await apiClient.get('/weather/live');
  return data;
};

/** UKC's own live Weather Underground PWS (current measured conditions at Gülbahçe). */
export const fetchPwsLive = async () => {
  const { data } = await apiClient.get('/weather/pws');
  return data;
};

/** Recorded live-station history (Windguru-style). range = '6h' | '24h' | '7d'. */
export const fetchPwsHistory = async (range = '24h') => {
  const { data } = await apiClient.get('/weather/pws/history', { params: { range } });
  return data;
};
