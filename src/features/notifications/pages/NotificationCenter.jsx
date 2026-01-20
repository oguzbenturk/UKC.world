import { useMemo, useState, useCallback } from 'react';
import { Button, Card, Space, Tabs, Typography } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { useNavigate } from 'react-router-dom';
import NotificationList from '../components/NotificationList';
import { useNotificationActions, useNotificationList } from '../hooks/useNotifications';

const { Title, Text } = Typography;

const RATE_BOOKING_STORAGE_KEY = 'pendingRateBooking';

const NotificationCenter = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('all');
  const [markingId, setMarkingId] = useState(null);
  const pageSize = 10;

  const filters = useMemo(
    () => ({
      page,
      limit: pageSize,
      unreadOnly: activeTab === 'unread',
    }),
    [page, activeTab]
  );

  const { data, isLoading, isFetching } = useNotificationList(filters, {
    keepPreviousData: true,
  });
  const {
    markNotificationRead,
    markNotificationReadStatus,
    markAllNotificationsRead,
    markAllNotificationsStatus,
  } = useNotificationActions();

  const notifications = useMemo(() => data?.notifications ?? [], [data?.notifications]);
  const pagination = data?.pagination ?? { page: 1, limit: pageSize, pages: 1, total: 0 };
  const unreadCount = data?.meta?.unreadCount ?? 0;

  const handleTabChange = useCallback((key) => {
    setActiveTab(key);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((nextPage) => {
    setPage(nextPage);
  }, []);

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
      // storage not available; ignore
    }
  }, []);

  const handleNotificationClick = useCallback(
    async (notification) => {
      if (!notification) return;
      if (!notification.readAt) {
        setMarkingId(notification.id);
        try {
          await markNotificationRead(notification.id);
        } finally {
          setMarkingId(null);
        }
      }

      if (notification.data?.intent === 'rate_lesson' && notification.data?.ratingContext) {
        persistRatingContext(notification.data.ratingContext);
      }

      const href = notification.data?.cta?.href;
      if (href) {
        navigate(href);
      }
    },
    [markNotificationRead, navigate, persistRatingContext]
  );

  const handleMarkRead = useCallback(
    async (notificationId) => {
      setMarkingId(notificationId);
      try {
        await markNotificationRead(notificationId);
      } finally {
        setMarkingId(null);
      }
    },
    [markNotificationRead]
  );

  const handleMarkAll = useCallback(async () => {
    if (!unreadCount) {
      message.info('All notifications are already marked as read.');
      return;
    }
    try {
      await markAllNotificationsRead();
      setMarkingId(null);
    } catch {
      message.error('Failed to mark notifications as read. Please try again.');
    }
  }, [markAllNotificationsRead, unreadCount]);

  const tabItems = useMemo(
    () => [
      {
        key: 'all',
        label: 'All notifications',
        children: (
          <NotificationList
            notifications={notifications}
            isLoading={isLoading}
            isFetching={isFetching}
            onItemClick={handleNotificationClick}
            onMarkRead={handleMarkRead}
            markReadLoadingId={markNotificationReadStatus.isPending ? markingId : null}
          />
        ),
      },
      {
        key: 'unread',
        label: `Unread ${unreadCount ? `(${unreadCount})` : ''}`.trim(),
        children: (
          <NotificationList
            notifications={notifications}
            isLoading={isLoading}
            isFetching={isFetching}
            onItemClick={handleNotificationClick}
            onMarkRead={handleMarkRead}
            markReadLoadingId={markNotificationReadStatus.isPending ? markingId : null}
            emptyDescription="No unread notifications"
          />
        ),
      },
    ],
    [notifications, isLoading, isFetching, handleNotificationClick, handleMarkRead, markNotificationReadStatus.isPending, markingId, unreadCount]
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <Space direction="vertical" size="large" className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <Title level={3} className="!mb-1 text-slate-900 dark:text-slate-100">
              Notification Center
            </Title>
            <Text type="secondary">
              Stay on top of system updates, approvals, and important alerts.
            </Text>
          </div>
          <Space>
            <Button
              onClick={handleMarkAll}
              disabled={!unreadCount}
              loading={markAllNotificationsStatus.isPending}
            >
              Mark all as read
            </Button>
          </Space>
        </div>

        <Card styles={{ body: { padding: '1.25rem' } }}>
          <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            items={tabItems}
            destroyOnHidden={false}
          />
        </Card>

        <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
          <span>
            {pagination.total > 0
              ? (
                <>
                  Showing {(pagination.page - 1) * pagination.limit + 1}
                  {' '}–{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} notifications
                </>
              )
              : 'No notifications to display'}
          </span>
          <div>
            <Space.Compact>
              <Button
                disabled={pagination.page <= 1}
                onClick={() => handlePageChange(Math.max(pagination.page - 1, 1))}
              >
                Previous
              </Button>
              <Button
                disabled={pagination.page >= pagination.pages}
                onClick={() => handlePageChange(Math.min(pagination.page + 1, pagination.pages))}
              >
                Next
              </Button>
            </Space.Compact>
          </div>
        </div>
      </Space>
    </div>
  );
};

export default NotificationCenter;
