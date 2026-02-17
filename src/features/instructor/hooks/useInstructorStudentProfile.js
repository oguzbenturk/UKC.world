import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchInstructorStudentProfile,
  updateInstructorStudentProfile,
  createInstructorStudentProgress,
  deleteInstructorStudentProgress
} from '../services/instructorApi';

export function useInstructorStudentProfile(studentId) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [progressSaving, setProgressSaving] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const data = await fetchInstructorStudentProfile(studentId);
      setProfile(data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load student');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const updateProfile = useCallback(async (payload) => {
    if (!studentId) return null;
    setSaving(true);
    try {
      const updated = await updateInstructorStudentProfile(studentId, payload);
      setProfile((prev) => prev ? {
        ...prev,
        student: {
          ...prev.student,
          level: updated.level,
          notes: updated.notes,
          updatedAt: updated.updatedAt
        }
      } : prev);
      return updated;
    } catch (err) {
      throw err;
    } finally {
      setSaving(false);
    }
  }, [studentId]);

  const addProgress = useCallback(async (payload) => {
    if (!studentId) return null;
    setProgressSaving(true);
    try {
      const created = await createInstructorStudentProgress(studentId, payload);
      setProfile((prev) => prev ? {
        ...prev,
        progress: [created, ...(prev.progress || [])]
      } : prev);
      return created;
    } catch (err) {
      throw err;
    } finally {
      setProgressSaving(false);
    }
  }, [studentId]);

  const removeProgress = useCallback(async (progressId) => {
    if (!studentId) return;
    setProgressSaving(true);
    try {
      await deleteInstructorStudentProgress(studentId, progressId);
      setProfile((prev) => prev ? {
        ...prev,
        progress: (prev.progress || []).filter((item) => item.id !== progressId)
      } : prev);
    } catch (err) {
      throw err;
    } finally {
      setProgressSaving(false);
    }
  }, [studentId]);

  const derived = useMemo(() => {
    if (!profile) return null;
    const totalHours = profile.stats?.totalHours || 0;
    const progressPercent = Math.min(100, Math.round((totalHours / 20) * 100));
    return {
      ...profile,
      progressPercent
    };
  }, [profile]);

  return {
    profile: derived,
    loading,
    error,
    refresh: load,
    updateProfile,
    addProgress,
    removeProgress,
    saving,
    progressSaving
  };
}
