import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { realTimeService } from '@/shared/services/realTimeService';
import { useToast } from '@/shared/contexts/ToastContext';
import { mapNotification } from '../api/notificationsApi';
import { notificationQueryKeys } from './useNotifications';

export const useNotificationRealtime = () => {
  const queryClient = useQueryClient();
  const { showInfo } = useToast();

  useEffect(() => {
    const invalidateLists = () => {
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.root });
    };

    const handleNewNotification = (payload = {}) => {
      const raw = payload.notification || payload;
      if (!raw) {
        return;
      }

      const notification = mapNotification(raw);
      const title = notification.title || 'New notification';
      const message = notification.message || '';

      showInfo(message ? `${title}: ${message}` : title);
      invalidateLists();
    };

    const handleNotificationUpdate = (payload = {}) => {
      if (!payload?.notification) {
        return;
      }
      invalidateLists();
    };

    realTimeService.on('notification:new', handleNewNotification);
    realTimeService.on('notification:update', handleNotificationUpdate);

    return () => {
      realTimeService.off('notification:new', handleNewNotification);
      realTimeService.off('notification:update', handleNotificationUpdate);
    };
  }, [queryClient, showInfo]);
};

export default useNotificationRealtime;
