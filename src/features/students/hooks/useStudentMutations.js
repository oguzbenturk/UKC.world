import { useMutation, useQueryClient } from '@tanstack/react-query';
import { studentPortalApi } from '../services/studentPortalApi';
import { studentPortalQueryKeys } from './useStudentDashboard';

const invalidateStudentQueries = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: studentPortalQueryKeys.dashboard });
  queryClient.invalidateQueries({ queryKey: ['student-portal', 'schedule'], exact: false });
  queryClient.invalidateQueries({ queryKey: studentPortalQueryKeys.courses });
  queryClient.invalidateQueries({ queryKey: studentPortalQueryKeys.invoices });
  queryClient.invalidateQueries({ queryKey: studentPortalQueryKeys.profile });
  queryClient.invalidateQueries({ queryKey: studentPortalQueryKeys.preferences });
};

export const useStudentBookingMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, payload }) => studentPortalApi.updateBooking(bookingId, payload),
    onSuccess: () => {
      invalidateStudentQueries(queryClient);
    }
  });
};

export const useStudentSupportMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: studentPortalApi.submitSupportRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentPortalQueryKeys.dashboard });
    }
  });
};

export const useStudentProfileMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: studentPortalApi.updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentPortalQueryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: studentPortalQueryKeys.profile });
    }
  });
};

export const useStudentPreferencesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: studentPortalApi.updatePreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentPortalQueryKeys.preferences });
    }
  });
};
