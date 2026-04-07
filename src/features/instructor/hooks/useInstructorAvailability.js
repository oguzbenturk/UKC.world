import { useState, useCallback } from 'react';
import {
  fetchMyAvailability,
  requestTimeOff,
  cancelMyTimeOffRequest,
} from '../services/instructorAvailabilityApi';

/**
 * Hook for instructor self-service availability management.
 * Admins/managers use the API functions directly from instructorAvailabilityApi.js.
 */
export function useInstructorAvailability() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyAvailability(params);
      setEntries(data);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load availability');
    } finally {
      setLoading(false);
    }
  }, []);

  const requestOff = useCallback(async (payload) => {
    const entry = await requestTimeOff(payload);
    setEntries((prev) => [entry, ...prev]);
    return entry;
  }, []);

  const cancel = useCallback(async (id) => {
    const updated = await cancelMyTimeOffRequest(id);
    setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
    return updated;
  }, []);

  return { entries, loading, error, load, requestOff, cancel };
}
