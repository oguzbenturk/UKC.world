import { useState, useCallback } from 'react';
import { Badge, Button, Divider, Popover } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { BellIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import NotificationList from './NotificationList';
import { useNotificationActions, useNotificationList, notificationQueryKeys } from '../hooks/useNotifications';
import apiClient from '@/shared/services/apiClient';

const RATE_BOOKING_STORAGE_KEY = 'pendingRateBooking';

const NotificationBell = () => {
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
      message.error('Failed to mark notifications as read. Please try again.');
    }
  }, [markAllNotificationsRead, unreadCount]);

  const handleClearAll = useCallback(async () => {
    if (!notifications?.length) return;
    try {
      await clearAllNotifications();
      message.success('All notifications cleared');
    } catch {
      message.error('Failed to clear notifications. Please try again.');
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
        message.error('Friend request information not found');
        return;
      }
      
      try {
        if (actionKey === 'accept') {
          await apiClient.post(`/relationships/${relationshipId}/accept`);
          message.success('Friend request accepted! You can now invite them to group lessons.');
        } else if (actionKey === 'decline') {
          await apiClient.post(`/relationships/${relationshipId}/decline`);
          message.success('Friend request declined');
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
        message.error(error?.response?.data?.error || 'Failed to respond to friend request');
      }
      return;
    }
    
    // Handle group booking invitation actions
    if (notificationType === 'group_booking_invitation') {
      const groupBookingId = notification?.data?.groupBookingId;
      if (!groupBookingId) {
        message.error('Group booking information not found');
        return;
      }
      
      try {
        if (actionKey === 'accept') {
          await apiClient.post(`/group-bookings/${groupBookingId}/accept`);
          message.success('Invitation accepted! You will be notified when the lesson is confirmed.');
        } else if (actionKey === 'decline') {
          await apiClient.post(`/group-bookings/${groupBookingId}/decline`);
          message.success('Invitation declined');
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
        message.error(error?.response?.data?.error || 'Failed to respond to invitation');
      }
      return;
    }
    
    // Handle regular booking actions (approve/cancel)
    const bookingId = notification?.data?.bookingId;
    if (!bookingId) {
      message.error('Booking information not found');
      return;
    }

    try {
      if (actionKey === 'approve') {
        await apiClient.patch(`/bookings/${bookingId}/status`, { status: 'confirmed' });
        message.success('Booking approved successfully');
      } else if (actionKey === 'cancel') {
        await apiClient.patch(`/bookings/${bookingId}/status`, { status: 'cancelled' });
        message.success('Booking declined');
      }
      
      // Optimistically update ALL notification list caches to hide buttons immediately
      queryClient.setQueriesData(
        { queryKey: ['notifications', 'list'] },
        (oldData) => {
          if (!oldData?.notifications) return oldData;
          
          return {
            ...oldData,
            notifications: oldData.notifications.map(notif => {
              // Update this notification and any related notifications with the same bookingId
              if (notif.data?.bookingId === bookingId) {
                return {
                  ...notif,
                  data: {
                    ...notif.data,
                    status: 'processed'
                  }
                };
              }
              return notif;
            })
          };
        }
      );
      
      // Don't refetch - the optimistic update is sufficient
      // Next time the dropdown opens, it will fetch fresh data from server
      
    } catch (error) {
      message.error(error?.response?.data?.error || 'Failed to update booking status');
    }
  }, [queryClient]);

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
    async (notification) => {
      if (!notification) return;
      if (!notification.readAt) {
        await handleMarkRead(notification.id);
      }

      if (notification.data?.intent === 'rate_lesson' && notification.data?.ratingContext) {
        persistRatingContext(notification.data.ratingContext);
      }

      const href = notification.data?.cta?.href;
      if (href) {
        setOpen(false);
        navigate(href);
      }
    },
    [handleMarkRead, navigate, persistRatingContext]
  );

  const popoverContent = (
    <div style={{ width: '380px', maxWidth: '90vw' }}>
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold text-gray-900">Notifications</h3>
          <span className="text-sm text-gray-600">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All read'}
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
              Mark all read
            </Button>
          )}
          {notifications?.length > 0 && (
            <Button
              size="small"
              onClick={handleClearAll}
              loading={clearAllNotificationsStatus.isPending}
              className="flex-1"
            >
              Clear all
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
        emptyDescription="You're all caught up!"
      />

      <Divider className="my-2" />
      <Button 
        type="link" 
        block 
        onClick={handleNavigateToCenter}
        className="text-sm"
      >
        View all notifications
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
          aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
        >
          <BellIcon className="h-5 w-5" />
        </button>
      </Badge>
    </Popover>
  );
};

export default NotificationBell;
