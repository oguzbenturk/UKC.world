import { useEffect, useState, useCallback } from 'react';
import { fetchInstructorStudents } from '../services/instructorApi';

export function useInstructorStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const list = await fetchInstructorStudents();
      setStudents(list);
      setError(null);
    } catch (e) {
      setError(e.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { students, loading, error, refetch: load };
}
