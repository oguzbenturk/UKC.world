import { useEffect, useState, useCallback } from 'react';
import { fetchInstructorDashboard } from '../services/instructorApi';
import { getAccessToken } from '@/shared/services/apiClient';

const STORAGE_KEY = 'instructor-dashboard-cache::v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const readCache = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.data || !parsed.timestamp) return null;
    const isExpired = Date.now() - parsed.timestamp > CACHE_TTL_MS;
    if (isExpired) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeCache = (data) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch {
    // Ignore storage quota / serialization errors silently
  }
};

export function useInstructorDashboard(autoRefreshMs = 0, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const hasToken = getAccessToken() || localStorage.getItem('token');
    if (!hasToken) {
      setLoading(false);
      return;
    }
    try {
      if (!silent) {
        setLoading(true);
      }
      const d = await fetchInstructorDashboard();
      setData(d);
      const now = Date.now();
      setLastUpdated(now);
      setError(null);
      writeCache(d);
    } catch (e) {
      setError(e.message || 'Failed to load dashboard');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    let silent = false;
    const cached = readCache();
    if (cached) {
      setData(cached.data);
      setLastUpdated(cached.timestamp);
      setLoading(false);
      silent = true;
    }
    load({ silent });
  }, [load]);

  useEffect(() => {
    if (!autoRefreshMs) return;
    const id = setInterval(() => load(), autoRefreshMs);
    return () => clearInterval(id);
  }, [autoRefreshMs, load]);
  return { data, loading, error, refetch: () => load(), lastUpdated };
}
