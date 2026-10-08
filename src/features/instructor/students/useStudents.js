// TanStack Query hooks for the instructor "My students" list and student profile.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import apiClient from '@/shared/services/apiClient';
import { message } from '@/shared/utils/antdStatic';
import {
  createInstructorStudentProgress,
  createStudentRecommendation,
  deleteInstructorStudentProgress,
  deleteStudentRecommendation,
  fetchInstructorStudentProfile,
  fetchInstructorStudents,
  updateInstructorStudentProfile,
} from '../services/instructorApi';

export const studentKeys = {
  all: ['instructor-students'],
  list: () => ['instructor-students', 'list'],
  profile: (id) => ['instructor-students', 'profile', id],
  catalog: (type) => ['instructor-students', 'catalog', type],
  notes: (id) => ['instructor', 'student-notes', id],
};

export function useStudentsList() {
  return useQuery({
    queryKey: studentKeys.list(),
    queryFn: fetchInstructorStudents,
    staleTime: 60_000,
  });
}

export function useStudentProfile(studentId) {
  return useQuery({
    queryKey: studentKeys.profile(studentId),
    queryFn: () => fetchInstructorStudentProfile(studentId),
    enabled: Boolean(studentId),
    staleTime: 30_000,
    retry: (count, error) => ![403, 404].includes(error?.response?.status) && count < 2,
  });
}

export const apiErrorText = (error, fallback) => {
  const data = error?.response?.data;
  if (typeof data?.error === 'string') return data.error;
  if (typeof data?.message === 'string') return data.message;
  return fallback;
};

/** Mutation that refreshes the profile + list and toasts on success / error. */
function useStudentMutation(studentId, mutationFn, { successKey, errorKey }) {
  const { t } = useTranslation(['instructor']);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      if (successKey) message.success(t(successKey));
      queryClient.invalidateQueries({ queryKey: studentKeys.profile(studentId) });
      queryClient.invalidateQueries({ queryKey: studentKeys.list() });
    },
    onError: (error) => message.error(apiErrorText(error, t(errorKey))),
  });
}

export function useStudentActions(studentId) {
  const updateProfile = useStudentMutation(
    studentId,
    (payload) => updateInstructorStudentProfile(studentId, payload),
    { successKey: 'instructor:students.toast.profileSaved', errorKey: 'instructor:students.toast.profileError' },
  );
  const addProgress = useStudentMutation(
    studentId,
    (payload) => createInstructorStudentProgress(studentId, payload),
    { successKey: 'instructor:students.toast.skillSaved', errorKey: 'instructor:students.toast.skillError' },
  );
  const removeProgress = useStudentMutation(
    studentId,
    (progressId) => deleteInstructorStudentProgress(studentId, progressId),
    { successKey: 'instructor:students.toast.skillRemoved', errorKey: 'instructor:students.toast.genericError' },
  );
  const addRecommendation = useStudentMutation(
    studentId,
    (payload) => createStudentRecommendation(studentId, payload),
    { successKey: 'instructor:students.toast.recSaved', errorKey: 'instructor:students.toast.recError' },
  );
  const removeRecommendation = useStudentMutation(
    studentId,
    (recId) => deleteStudentRecommendation(studentId, recId),
    { successKey: 'instructor:students.toast.recRemoved', errorKey: 'instructor:students.toast.genericError' },
  );
  return { updateProfile, addProgress, removeProgress, addRecommendation, removeRecommendation };
}

const CATALOG_ENDPOINTS = {
  product: '/products/?limit=200',
  service: '/services/?limit=200',
  rental: '/services/?serviceType=rental&limit=200',
  accommodation: '/accommodation/units?limit=200',
};

const toArray = (data) => {
  const arr = Array.isArray(data) ? data : (data?.items || data?.services || data?.units || data?.data || []);
  return Array.isArray(arr) ? arr : [];
};

/** Items an instructor can recommend, per category (custom has no catalogue). */
export function useRecommendationCatalog(type, enabled) {
  return useQuery({
    queryKey: studentKeys.catalog(type),
    queryFn: async () => toArray((await apiClient.get(CATALOG_ENDPOINTS[type])).data),
    enabled: Boolean(enabled && CATALOG_ENDPOINTS[type]),
    staleTime: 5 * 60_000,
  });
}
