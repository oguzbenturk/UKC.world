import apiClient from '@/shared/services/apiClient';

export const mapNotification = (item) => ({
  id: item.id,
  userId: item.userId ?? item.user_id,
  title: item.title,
  message: item.message,
  type: item.type || 'general',
  status: item.status || (item.readAt || item.read_at ? 'read' : 'sent'),
  data: item.data ?? {},
  createdAt: item.createdAt || item.created_at,
  updatedAt: item.updatedAt || item.updated_at,
  readAt: item.readAt || item.read_at,
});

export const fetchNotifications = async ({ page = 1, limit = 10, unreadOnly = false } = {}) => {
  const { data } = await apiClient.get('/notifications/user', {
    params: {
      page,
      limit,
      unreadOnly,
    },
  });

  return {
    notifications: Array.isArray(data?.notifications)
      ? data.notifications.map(mapNotification)
      : [],
    pagination: data?.pagination ?? {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      total: 0,
      pages: 1,
    },
    meta: data?.meta ?? { unreadCount: 0, totalCount: 0 },
  };
};

export const markNotificationRead = async (notificationId) => {
  if (!notificationId) {
    throw new Error('Notification ID is required to mark as read');
  }

  const { data } = await apiClient.patch(`/notifications/${notificationId}/read`);
  return mapNotification(data);
};

export const markAllNotificationsRead = async () => {
  const { data } = await apiClient.patch('/notifications/read-all');
  return data;
};

export const clearAllNotifications = async () => {
  const { data } = await apiClient.delete('/notifications/clear-all');
  return data;
};

export const notificationsApi = {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  clearAllNotifications,
};

export default notificationsApi;
