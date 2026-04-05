import { useState, useEffect } from 'react';
import apiClient from '@/shared/services/apiClient';
import { resolveRoleIdByName } from '@/shared/constants/roles';

/**
 * Loads the current instructor role id from GET /api/roles (UUIDs change after DB reseed).
 * When disabled, returns null without fetching.
 */
export function useInstructorRoleId(enabled = true) {
  const [instructorRoleId, setInstructorRoleId] = useState(null);
  const [loading, setLoading] = useState(!!enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setInstructorRoleId(null);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    apiClient
      .get('/roles')
      .then((res) => {
        if (cancelled) return;
        const id = resolveRoleIdByName(res.data, 'instructor');
        setInstructorRoleId(id);
        if (!id) setError(new Error('Instructor role not found in database'));
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e);
          setInstructorRoleId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { instructorRoleId, loading, error };
}
