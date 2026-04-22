import { useState, useCallback } from 'react';
import { Badge, Button, Divider, Popover } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { BellIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import NotificationList from './NotificationList';
import { useNotificationActions, useNotificationList } from '../hooks/useNotifications';
import apiClient from '@/shared/services/apiClient';

const RATE_BOOKING_STORAGE_KEY = 'pendingRateBooking';

const NotificationBell = () => {
  const { t } = useTranslation(['common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [markingId, setMarkingId] = useState(null);

  const { data, isLoading, isFetching, refetch } = useNotificationList({ limit: 10 });
  const {
    markNotificationRead,
    markNotificationReadStatus,
    markAllNotificationsRead,
    markAllNotificationsStatus,
    clearAllNotifications,
    clearAllNotificationsStatus,
  } = useNotificationActions();

  const unreadCount = data?.meta?.unreadCount ?? 0;
  const notifications = data?.notifications ?? [];

  const handleOpenChange = useCallback(
    (nextOpen) => {
      setOpen(nextOpen);
      if (nextOpen) {
        refetch();
      }
    },
    [refetch]
  );

  const handleMarkRead = useCallback(
    async (notificationId) => {
      if (!notificationId) return;
      try {
        setMarkingId(notificationId);
        await markNotificationRead(notificationId);
      } finally {
        setMarkingId(null);
      }
    },
    [markNotificationRead]
  );

  const handleMarkAll = useCallback(async () => {
    if (!unreadCount) return;
    try {
      await markAllNotificationsRead();
    } catch {
      message.error(t('common:notifications.failMarkRead'));
    }
  }, [markAllNotificationsRead, unreadCount, t]);

  const handleClearAll = useCallback(async () => {
    if (!notifications?.length) return;
    try {
      await clearAllNotifications();
      message.success(t('common:notifications.cleared'));
    } catch {
      message.error(t('common:notifications.failClearAll'));
    }
  }, [clearAllNotifications, notifications?.length]);

  const handleNavigateToCenter = useCallback(() => {
    setOpen(false);
    navigate('/notifications');
  }, [navigate]);

  const handleAction = useCallback(async (notification, actionKey) => {
    const notificationType = notification?.type;
    
    // Handle friend request actions
    if (notificationType === 'friend_request') {
      const relationshipId = notification?.data?.relationshipId;
      if (!relationshipId) {
        message.error(t('common:notifications.friendRequestNotFound'));
        return;
      }

      try {
        if (actionKey === 'accept') {
          await apiClient.post(`/relationships/${relationshipId}/accept`);
          message.success(t('common:notifications.friendAccepted'));
        } else if (actionKey === 'decline') {
          await apiClient.post(`/relationships/${relationshipId}/decline`);
          message.success(t('common:notifications.friendDeclined'));
        }
        
        // Optimistically update notification cache
        queryClient.setQueriesData(
          { queryKey: ['notifications', 'list'] },
          (oldData) => {
            if (!oldData?.notifications) return oldData;
            return {
              ...oldData,
              notifications: oldData.notifications.map(notif => {
                if (notif.data?.relationshipId === relationshipId) {
                  return {
                    ...notif,
                    data: { ...notif.data, status: 'processed' }
                  };
                }
                return notif;
              })
            };
          }
        );
      } catch (error) {
        message.error(error?.response?.data?.error || t('common:notifications.failFriendRequest'));
      }
      return;
    }

    // Handle group booking invitation actions
    if (notificationType === 'group_booking_invitation') {
      const groupBookingId = notification?.data?.groupBookingId;
      if (!groupBookingId) {
        message.error(t('common:notifications.inviteNotFound'));
        return;
      }

      try {
        if (actionKey === 'accept') {
          await apiClient.post(`/group-bookings/${groupBookingId}/accept`);
          message.success(t('common:notifications.inviteAccepted'));
        } else if (actionKey === 'decline') {
          await apiClient.post(`/group-bookings/${groupBookingId}/decline`);
          message.success(t('common:notifications.inviteDeclined'));
        }
        
        // Optimistically update notification cache
        queryClient.setQueriesData(
          { queryKey: ['notifications', 'list'] },
          (oldData) => {
            if (!oldData?.notifications) return oldData;
            return {
              ...oldData,
              notifications: oldData.notifications.map(notif => {
                if (notif.data?.groupBookingId === groupBookingId) {
                  return {
                    ...notif,
                    data: { ...notif.data, status: 'processed' }
                  };
                }
                return notif;
              })
            };
          }
        );
      } catch (error) {
        message.error(error?.response?.data?.error || t('common:notifications.failInvite'));
      }
      return;
    }
    
    // For booking notifications, navigate to the daily program instead of inline approve/decline
    const cta = notification?.data?.cta;
    if (cta?.href) {
      setOpen(false);
      if (!notification.readAt) {
        try { await markNotificationRead(notification.id); } catch { /* silent */ }
      }
      navigate(cta.href);
    }
  }, [queryClient, markNotificationRead, navigate]);

  const persistRatingContext = useCallback((payload) => {
    try {
      if (!payload?.bookingId) {
        return;
      }

      const instructor = payload.instructor
        ? {
            id: payload.instructor.id ?? null,
            name:
              payload.instructor.name ??
              (typeof payload.instructor === 'string' ? payload.instructor : null),
            avatar: payload.instructor.avatar ?? null
          }
        : null;

      const service = (() => {
        if (!payload.service) {
          return null;
        }

        if (typeof payload.service === 'string') {
          return { id: null, name: payload.service, type: null };
        }

        return {
          id: payload.service.id ?? null,
          name: payload.service.name ?? payload.service.title ?? null,
          type: payload.service.type ?? null
        };
      })();

      sessionStorage.setItem(
        RATE_BOOKING_STORAGE_KEY,
        JSON.stringify({
          bookingId: String(payload.bookingId),
          date: payload.date || null,
          instructor,
          service
        })
      );
    } catch {
      // no-op: storage failures shouldn't block navigation
    }
  }, []);

  const handleNotificationClick = useCallback(
    (notification) => {
      if (!notification) return;
      // Fire mark-as-read in background — never block navigation on a network call
      if (!notification.readAt) {
        handleMarkRead(notification.id).catch(() => {});
      }

      if (notification.data?.intent === 'rate_lesson' && notification.data?.ratingContext) {
        persistRatingContext(notification.data.ratingContext);
      }

      const href = notification.data?.cta?.href || notification.data?.link;
      setOpen(false);
      // Accommodation booking notifications → Stay calendar
      if (notification.type === 'accommodation_booking' || notification.data?.bookingType === 'accommodation') {
        navigate('/calendars/stay');
        return;
      }
      // Shop order notifications → orders tab with order modal open
      if (notification.type === 'shop_order') {
        const orderId = notification.data?.orderId;
        navigate(orderId ? `/services/shop?orderId=${orderId}` : '/services/shop');
        return;
      }
      // Instructor pending booking notifications → daily calendar with booking open
      if (notification.type === 'new_booking_alert') {
        const bookingId = notification.data?.bookingId;
        const date = notification.data?.date;
        const params = new URLSearchParams();
        if (bookingId) params.set('bookingId', String(bookingId));
        if (date) params.set('date', date);
        navigate(`/calendars/lessons?${params.toString()}`);
        return;
      }
      if (href) {
        // Redirect rental booking notifications to the Rental Requests tab
        const sType = notification.data?.serviceType;
        const sName = (notification.data?.serviceName || '').toLowerCase();
        const isRental = sType === 'rental' || sName.includes('rental') || sName.includes('equipment');
        if (isRental && href.startsWith('/bookings/')) {
          navigate('/calendars/rentals?tab=requests');
        } else {
          navigate(href);
        }
      }
    },
    [handleMarkRead, navigate, persistRatingContext]
  );

  const popoverContent = (
    <div style={{ width: '380px', maxWidth: '90vw' }}>
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold text-gray-900">{t('common:notifications.title')}</h3>
          <span className="text-sm text-gray-600">
            {unreadCount > 0 ? t('common:notifications.unreadCount', { count: unreadCount }) : t('common:notifications.allRead')}
          </span>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button
              size="small"
              onClick={handleMarkAll}
              loading={markAllNotificationsStatus.isPending}
              className="flex-1"
            >
              {t('common:notifications.markAllRead')}
            </Button>
          )}
          {notifications?.length > 0 && (
            <Button
              size="small"
              onClick={handleClearAll}
              loading={clearAllNotificationsStatus.isPending}
              className="flex-1"
            >
              {t('common:notifications.clearAll')}
            </Button>
          )}
        </div>
      </div>

      <NotificationList
        notifications={notifications}
        isLoading={isLoading}
        isFetching={isFetching}
        onItemClick={handleNotificationClick}
        onMarkRead={handleMarkRead}
        onAction={handleAction}
        markReadLoadingId={markNotificationReadStatus.isPending ? markingId : null}
        compact
        emptyDescription={t('common:notifications.caughtUp')}
      />

      <Divider className="my-2" />
      <Button
        type="link"
        block
        onClick={handleNavigateToCenter}
        className="text-sm"
      >
        {t('common:notifications.viewAll')}
      </Button>
    </div>
  );

  return (
    <Popover
      placement="bottomRight"
      trigger="click"
      content={popoverContent}
      open={open}
      onOpenChange={handleOpenChange}
      overlayClassName="notification-bell-popover"
    >
      <Badge count={unreadCount} overflowCount={99} size="small">
        <button
          type="button"
          className="p-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-700/50"
          aria-label={unreadCount ? t('common:notifications.unreadCount', { count: unreadCount }) : t('common:notifications.title')}
        >
          <BellIcon className="h-5 w-5" />
        </button>
      </Badge>
    </Popover>
  );
};

export default NotificationBell;
