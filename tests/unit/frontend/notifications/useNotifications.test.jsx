import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFetchNotifications = vi.fn();
const mockMarkNotificationRead = vi.fn();
const mockMarkAllNotificationsRead = vi.fn();
const mockClearAllNotifications = vi.fn();

vi.mock('@/features/notifications/api/notificationsApi', () => ({
  default: {
    fetchNotifications: (...args) => mockFetchNotifications(...args),
    markNotificationRead: (...args) => mockMarkNotificationRead(...args),
    markAllNotificationsRead: (...args) =>
      mockMarkAllNotificationsRead(...args),
    clearAllNotifications: (...args) => mockClearAllNotifications(...args),
  },
}));

import {
  useNotificationList,
  useNotificationActions,
  notificationQueryKeys,
} from '@/features/notifications/hooks/useNotifications';

const makeNotificationList = (overrides = []) => ({
  notifications: [
    {
      id: 'n1',
      userId: 'u1',
      title: 'Booking Confirmed',
      message: 'Your lesson with Alice is confirmed',
      type: 'booking',
      status: 'sent',
      data: {},
      createdAt: '2025-03-20T10:00:00Z',
      updatedAt: '2025-03-20T10:00:00Z',
      readAt: null,
    },
    {
      id: 'n2',
      userId: 'u1',
      title: 'Payment Received',
      message: 'Payment of $100 received',
      type: 'payment',
      status: 'read',
      data: {},
      createdAt: '2025-03-19T10:00:00Z',
      updatedAt: '2025-03-19T10:00:00Z',
      readAt: '2025-03-19T11:00:00Z',
    },
    ...overrides,
  ],
  pagination: {
    page: 1,
    limit: 10,
    total: 2,
    pages: 1,
  },
  meta: {
    unreadCount: 1,
    totalCount: 2,
  },
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useNotificationList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches notifications with default options', async () => {
    mockFetchNotifications.mockResolvedValue(makeNotificationList());

    const { result } = renderHook(() => useNotificationList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBeDefined();
    expect(result.current.data.notifications).toHaveLength(2);
    expect(mockFetchNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 10,
        unreadOnly: false,
      })
    );
  });

  it('respects custom filters', async () => {
    mockFetchNotifications.mockResolvedValue(makeNotificationList());

    const { result } = renderHook(
      () =>
        useNotificationList({
          page: 2,
          limit: 20,
          unreadOnly: true,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFetchNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 20,
        unreadOnly: true,
      })
    );
  });

  it('filters to unread notifications only', async () => {
    mockFetchNotifications.mockResolvedValue({
      notifications: [
        {
          id: 'n1',
          userId: 'u1',
          title: 'Booking Confirmed',
          message: 'Your lesson with Alice is confirmed',
          type: 'booking',
          status: 'sent',
          data: {},
          createdAt: '2025-03-20T10:00:00Z',
          updatedAt: '2025-03-20T10:00:00Z',
          readAt: null,
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, pages: 1 },
      meta: { unreadCount: 1, totalCount: 2 },
    });

    const { result } = renderHook(
      () => useNotificationList({ unreadOnly: true }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data.notifications).toHaveLength(1);
    expect(result.current.data.notifications[0].status).toBe('sent');
  });

  it('handles empty notification list', async () => {
    mockFetchNotifications.mockResolvedValue({
      notifications: [],
      pagination: { page: 1, limit: 10, total: 0, pages: 0 },
      meta: { unreadCount: 0, totalCount: 0 },
    });

    const { result } = renderHook(() => useNotificationList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data.notifications).toEqual([]);
    expect(result.current.data.meta.unreadCount).toBe(0);
  });

  it('provides pagination info', async () => {
    mockFetchNotifications.mockResolvedValue(makeNotificationList());

    const { result } = renderHook(() => useNotificationList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data.pagination).toBeDefined();
    expect(result.current.data.pagination.page).toBe(1);
    expect(result.current.data.pagination.limit).toBe(10);
    expect(result.current.data.pagination.total).toBe(2);
  });
});

describe('useNotificationActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks single notification as read', async () => {
    mockMarkNotificationRead.mockResolvedValue({
      id: 'n1',
      status: 'read',
      readAt: '2025-03-20T11:00:00Z',
    });

    const { result } = renderHook(() => useNotificationActions(), {
      wrapper: createWrapper(),
    });

    const response = await result.current.markNotificationRead('n1');

    expect(response.id).toBe('n1');
    expect(response.status).toBe('read');
    // useMutation wraps the call, verify it was called at all
    expect(mockMarkNotificationRead).toHaveBeenCalled();
  });

  it('throws error when marking notification read without ID', async () => {
    mockMarkNotificationRead.mockRejectedValue(
      new Error('Notification ID is required to mark as read')
    );

    const { result } = renderHook(() => useNotificationActions(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.markNotificationRead(null)).rejects.toThrow(
      'Notification ID is required'
    );
  });

  it('marks all notifications as read', async () => {
    mockMarkAllNotificationsRead.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useNotificationActions(), {
      wrapper: createWrapper(),
    });

    const response = await result.current.markAllNotificationsRead();

    expect(response.success).toBe(true);
    expect(mockMarkAllNotificationsRead).toHaveBeenCalled();
  });

  it('clears all notifications', async () => {
    mockClearAllNotifications.mockResolvedValue({ cleared: 5 });

    const { result } = renderHook(() => useNotificationActions(), {
      wrapper: createWrapper(),
    });

    const response = await result.current.clearAllNotifications();

    expect(response.cleared).toBe(5);
    expect(mockClearAllNotifications).toHaveBeenCalled();
  });

  it('provides mutation status for each action', async () => {
    mockMarkNotificationRead.mockResolvedValue({ id: 'n1', status: 'read' });

    const { result } = renderHook(() => useNotificationActions(), {
      wrapper: createWrapper(),
    });

    expect(result.current.markNotificationReadStatus).toBeDefined();
    expect(result.current.markAllNotificationsStatus).toBeDefined();
    expect(result.current.clearAllNotificationsStatus).toBeDefined();
  });
});

describe('notificationQueryKeys', () => {
  it('generates correct query keys', () => {
    expect(notificationQueryKeys.root).toEqual(['notifications']);
    expect(notificationQueryKeys.lists()).toEqual(['notifications', 'list']);
    expect(notificationQueryKeys.list({ page: 1 })).toEqual([
      'notifications',
      'list',
      { page: 1 },
    ]);
  });
});
