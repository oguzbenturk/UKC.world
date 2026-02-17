import { useQuery } from '@tanstack/react-query';
import { studentPortalApi } from '../services/studentPortalApi';

const queryKeys = {
  dashboard: ['student-portal', 'dashboard'],
  schedule: (filters) => ['student-portal', 'schedule', filters],
  courses: ['student-portal', 'courses'],
  invoices: ['student-portal', 'invoices'],
  profile: ['student-portal', 'profile'],
  preferences: ['student-portal', 'preferences'],
  recommendations: ['student-portal', 'recommendations']
};

export const useStudentDashboard = ({ autoRefresh = false, refetchIntervalMs = 120_000, ...queryOptions } = {}) => {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: studentPortalApi.fetchDashboard,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: autoRefresh ? refetchIntervalMs : false,
    ...queryOptions
  });
};

export const useStudentSchedule = (filters) => {
  return useQuery({
    queryKey: queryKeys.schedule(filters),
    queryFn: () => studentPortalApi.fetchSchedule(filters),
    staleTime: 60_000
  });
};

export const useStudentCourses = () => {
  return useQuery({
    queryKey: queryKeys.courses,
    queryFn: studentPortalApi.fetchCourses
  });
};

export const useStudentInvoices = (filters) => {
  return useQuery({
    queryKey: queryKeys.invoices,
    queryFn: () => studentPortalApi.fetchInvoices(filters)
  });
};

export const useStudentProfile = () => {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: studentPortalApi.fetchProfile
  });
};

export const useStudentPreferences = () => {
  return useQuery({
    queryKey: queryKeys.preferences,
    queryFn: studentPortalApi.fetchPreferences
  });
};

export const useStudentRecommendations = () => {
  return useQuery({
    queryKey: queryKeys.recommendations,
    queryFn: studentPortalApi.fetchRecommendations
  });
};

export const studentPortalQueryKeys = queryKeys;
