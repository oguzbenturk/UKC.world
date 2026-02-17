import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import notificationsApi from '../api/notificationsApi';

export const notificationQueryKeys = {
  root: ['notifications'],
  lists: () => ['notifications', 'list'],
  list: (filters) => ['notifications', 'list', filters],
};

const DEFAULT_LIST_OPTIONS = {
  page: 1,
  limit: 10,
  unreadOnly: false,
};

export const useNotificationList = (filters = {}, queryOptions = {}) => {
  const params = useMemo(() => ({ ...DEFAULT_LIST_OPTIONS, ...filters }), [filters]);

  return useQuery({
    queryKey: notificationQueryKeys.list(params),
    queryFn: () => notificationsApi.fetchNotifications(params),
    staleTime: 0, // Always fetch fresh data to show correct timestamps
    gcTime: 0, // Don't cache old data at all
    refetchOnWindowFocus: true,
    refetchInterval: false, // Disable auto-refetch to avoid excessive requests
    ...queryOptions,
  });
};

export const useNotificationActions = () => {
  const queryClient = useQueryClient();

  const invalidateNotifications = () => {
    queryClient.invalidateQueries({ queryKey: notificationQueryKeys.root });
    queryClient.invalidateQueries({ queryKey: notificationQueryKeys.lists() });
  };

  const markRead = useMutation({
    mutationFn: notificationsApi.markNotificationRead,
    onSuccess: () => {
      invalidateNotifications();
    },
  });

  const markAll = useMutation({
    mutationFn: notificationsApi.markAllNotificationsRead,
    onSuccess: () => {
      invalidateNotifications();
    },
  });

  const clearAll = useMutation({
    mutationFn: notificationsApi.clearAllNotifications,
    onSuccess: () => {
      invalidateNotifications();
    },
  });

  return {
    markNotificationRead: markRead.mutateAsync,
    markNotificationReadStatus: markRead,
    markAllNotificationsRead: markAll.mutateAsync,
    markAllNotificationsStatus: markAll,
    clearAllNotifications: clearAll.mutateAsync,
    clearAllNotificationsStatus: clearAll,
  };
};
