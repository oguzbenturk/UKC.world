import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchInstructorStudentProfile,
  updateInstructorStudentProfile,
  createInstructorStudentProgress,
  deleteInstructorStudentProgress,
  createStudentRecommendation,
  deleteStudentRecommendation
} from '../services/instructorApi';

export function useInstructorStudentProfile(studentId) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [progressSaving, setProgressSaving] = useState(false);
  const [recSaving, setRecSaving] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const data = await fetchInstructorStudentProfile(studentId);
      setProfile(data);
      setError(null);
    } catch (err) {
      const rawErr = err.response?.data?.error;
      setError(typeof rawErr === 'string' ? rawErr : err.response?.data?.message || err.message || 'Failed to load student');
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

  const addRecommendation = useCallback(async (payload) => {
    if (!studentId) return null;
    setRecSaving(true);
    try {
      const created = await createStudentRecommendation(studentId, payload);
      setProfile(prev => prev ? { ...prev, recommendations: [created, ...(prev.recommendations || [])] } : prev);
      return created;
    } catch (err) { throw err; }
    finally { setRecSaving(false); }
  }, [studentId]);

  const removeRecommendation = useCallback(async (recId) => {
    if (!studentId) return;
    setRecSaving(true);
    try {
      await deleteStudentRecommendation(studentId, recId);
      setProfile(prev => prev ? {
        ...prev,
        recommendations: (prev.recommendations || []).filter(r => r.id !== recId)
      } : prev);
    } catch (err) { throw err; }
    finally { setRecSaving(false); }
  }, [studentId]);

  const derived = useMemo(() => {
    if (!profile) return null;
    const pkg = profile.packageHours;
    const goalHours = Number(pkg?.totalHours || 0);
    const usedHours = Number(pkg?.usedHours || 0);
    const remainingHours = Number(pkg?.remainingHours || 0);
    const progressPercent = goalHours > 0
      ? Math.min(100, Math.round((usedHours / goalHours) * 100))
      : 0;
    return {
      ...profile,
      goalHours,
      remainingHours,
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
    progressSaving,
    addRecommendation,
    removeRecommendation,
    recSaving
  };
}
