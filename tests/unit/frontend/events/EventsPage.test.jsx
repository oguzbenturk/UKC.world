import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
  useQuery: () => ({
    data: [],
    isLoading: false,
  }),
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/shared/hooks/useData', () => ({
  useData: () => ({
    apiClient: null,
    usersWithStudentRole: [],
  }),
}));

vi.mock('@/shared/contexts/CurrencyContext', () => ({
  useCurrency: () => ({
    getCurrencySymbol: () => '\u20AC',
  }),
}));

vi.mock('@/shared/utils/antdStatic', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import EventsPage from '@/features/events/pages/EventsPage';

// ── Helpers ─────────────────────────────────────────────────────────────────

// Ant Design and some components read window.matchMedia
beforeEach(() => {
  vi.clearAllMocks();

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('EventsPage', () => {
  test('renders without crashing', () => {
    const { container } = render(<EventsPage />);
    expect(container).toBeTruthy();
  });

  test('renders header with "Event Manager" badge', () => {
    render(<EventsPage />);
    expect(screen.getByText('Event Manager')).toBeInTheDocument();
  });

  test('renders stats cards', () => {
    render(<EventsPage />);
    // The four stat labels rendered in the stats grid
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Registrations')).toBeInTheDocument();
  });

  test('renders search input', () => {
    render(<EventsPage />);
    expect(screen.getByPlaceholderText('Search events...')).toBeInTheDocument();
  });

  test('renders type filter pills', () => {
    render(<EventsPage />);
    // "All" pill is always present
    expect(screen.getByText('All')).toBeInTheDocument();
    // A selection of event-type pills
    expect(screen.getByText('Party / Social Event')).toBeInTheDocument();
    expect(screen.getByText('Diving Trip')).toBeInTheDocument();
    expect(screen.getByText('Yoga Session')).toBeInTheDocument();
    expect(screen.getByText('Workshop')).toBeInTheDocument();
    expect(screen.getByText('Competition')).toBeInTheDocument();
    expect(screen.getByText('Group Training')).toBeInTheDocument();
    expect(screen.getByText('Excursion / Trip')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  test('does not contain any purple/violet class names', () => {
    const { container } = render(<EventsPage />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/purple|violet|fuchsia/i);
  });
});
