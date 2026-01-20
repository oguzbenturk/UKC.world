import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NotificationBell from '../NotificationBell';

vi.mock('../../hooks/useNotifications', () => {
  const mockRefetch = vi.fn();
  return {
    useNotificationList: vi.fn(() => ({
      data: {
        notifications: [
          {
            id: '1',
            title: 'New booking',
            message: 'A new booking requires your approval',
            createdAt: new Date().toISOString(),
            readAt: null,
            data: {},
          },
        ],
        meta: { unreadCount: 1 },
      },
      isLoading: false,
      isFetching: false,
      refetch: mockRefetch,
    })),
    useNotificationActions: vi.fn(() => ({
      markNotificationRead: vi.fn().mockResolvedValue({}),
      markNotificationReadStatus: { isPending: false },
      markAllNotificationsRead: vi.fn().mockResolvedValue({}),
      markAllNotificationsStatus: { isPending: false },
    })),
  };
});

describe('NotificationBell', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders a badge with unread count and opens the popover', async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );

    const button = screen.getByRole('button', { name: /unread notifications/i });
    expect(button).toBeInTheDocument();

    const badge = screen.getByText('1');
    expect(badge).toBeInTheDocument();

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeVisible();
      expect(screen.getByText('New booking')).toBeVisible();
    });
  });
});
