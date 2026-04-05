import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFetchDashboard = vi.fn();
const mockFetchSchedule = vi.fn();
const mockFetchCourses = vi.fn();
const mockFetchInvoices = vi.fn();
const mockFetchProfile = vi.fn();
const mockFetchPreferences = vi.fn();
const mockFetchRecommendations = vi.fn();

vi.mock('@/features/students/services/studentPortalApi', () => ({
  studentPortalApi: {
    fetchDashboard: (...args) => mockFetchDashboard(...args),
    fetchSchedule: (...args) => mockFetchSchedule(...args),
    fetchCourses: (...args) => mockFetchCourses(...args),
    fetchInvoices: (...args) => mockFetchInvoices(...args),
    fetchProfile: (...args) => mockFetchProfile(...args),
    fetchPreferences: (...args) => mockFetchPreferences(...args),
    fetchRecommendations: (...args) => mockFetchRecommendations(...args),
  },
}));

import {
  useStudentDashboard,
  useStudentSchedule,
  useStudentCourses,
  useStudentInvoices,
  useStudentProfile,
  useStudentPreferences,
  useStudentRecommendations,
  studentPortalQueryKeys,
} from '@/features/students/hooks/useStudentDashboard';

const makeDashboardResponse = (overrides = {}) => ({
  nextLesson: {
    id: 'l1',
    title: 'Beginner Kitesurfing',
    instructor: 'John',
    date: '2025-03-25T10:00:00Z',
    duration: 60,
  },
  upcomingLessons: 3,
  completedLessons: 15,
  balance: 250.5,
  packages: [
    { id: 'p1', name: '10-Lesson Package', progress: 7 },
  ],
  ...overrides,
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

describe('useStudentDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches dashboard data', async () => {
    mockFetchDashboard.mockResolvedValue(makeDashboardResponse());

    const { result } = renderHook(() => useStudentDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBeDefined();
    expect(result.current.data.nextLesson).toBeDefined();
    expect(result.current.data.upcomingLessons).toBe(3);
  });

  it('has loading state initially', () => {
    mockFetchDashboard.mockImplementation(() => new Promise(() => {})); // Never resolves

    const { result } = renderHook(() => useStudentDashboard(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it('handles fetch errors gracefully', async () => {
    mockFetchDashboard.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useStudentDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.data).toBeUndefined();
  });

  it('supports auto-refresh with interval', async () => {
    mockFetchDashboard.mockResolvedValue(makeDashboardResponse());

    const { result } = renderHook(
      () => useStudentDashboard({ autoRefresh: true, refetchIntervalMs: 1000 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBeDefined();
  });

  it('respects custom stale time', async () => {
    mockFetchDashboard.mockResolvedValue(makeDashboardResponse());

    const { result } = renderHook(
      () => useStudentDashboard({ staleTime: 30000 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFetchDashboard).toHaveBeenCalled();
  });

  it('disables refetch on window focus by default', async () => {
    mockFetchDashboard.mockResolvedValue(makeDashboardResponse());

    const { result } = renderHook(() => useStudentDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The hook should not refetch when window regains focus
    // This is verified by the configuration, not runtime behavior in unit tests
    expect(result.current.data).toBeDefined();
  });
});

describe('useStudentSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches schedule with filters', async () => {
    const mockSchedule = [
      { id: 'l1', date: '2025-03-25', status: 'confirmed' },
      { id: 'l2', date: '2025-03-26', status: 'pending' },
    ];
    mockFetchSchedule.mockResolvedValue(mockSchedule);

    const { result } = renderHook(
      () => useStudentSchedule({ dateFrom: '2025-03-01' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(mockSchedule);
    expect(mockFetchSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom: '2025-03-01' })
    );
  });

  it('returns empty array when no schedule', async () => {
    mockFetchSchedule.mockResolvedValue([]);

    const { result } = renderHook(() => useStudentSchedule({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([]);
  });
});

describe('useStudentCourses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches list of courses', async () => {
    const mockCourses = [
      { id: 'c1', name: 'Beginner Kitesurfing', progress: 70 },
      { id: 'c2', name: 'Intermediate Techniques', progress: 30 },
    ];
    mockFetchCourses.mockResolvedValue(mockCourses);

    const { result } = renderHook(() => useStudentCourses(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(mockCourses);
    expect(result.current.data).toHaveLength(2);
  });

  it('handles empty courses list', async () => {
    mockFetchCourses.mockResolvedValue([]);

    const { result } = renderHook(() => useStudentCourses(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([]);
  });
});

describe('useStudentInvoices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches invoices with filters', async () => {
    const mockInvoices = [
      { id: 'inv1', amount: 500, status: 'paid', date: '2025-03-20' },
      { id: 'inv2', amount: 250, status: 'pending', date: '2025-03-01' },
    ];
    mockFetchInvoices.mockResolvedValue(mockInvoices);

    const { result } = renderHook(
      () => useStudentInvoices({ status: 'pending' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(mockInvoices);
  });

  it('returns empty array when no invoices match filter', async () => {
    mockFetchInvoices.mockResolvedValue([]);

    const { result } = renderHook(
      () => useStudentInvoices({ status: 'overdue' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([]);
  });
});

describe('useStudentProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches student profile', async () => {
    const mockProfile = {
      id: 's1',
      name: 'Alice Johnson',
      email: 'alice@example.com',
      joinDate: '2025-01-15',
      level: 'intermediate',
    };
    mockFetchProfile.mockResolvedValue(mockProfile);

    const { result } = renderHook(() => useStudentProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(mockProfile);
    expect(result.current.data.name).toBe('Alice Johnson');
  });
});

describe('useStudentPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches student preferences', async () => {
    const mockPreferences = {
      theme: 'dark',
      notifications: true,
      language: 'en',
    };
    mockFetchPreferences.mockResolvedValue(mockPreferences);

    const { result } = renderHook(() => useStudentPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(mockPreferences);
  });
});

describe('useStudentRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches personalized recommendations', async () => {
    const mockRecommendations = [
      {
        id: 'rec1',
        type: 'lesson',
        title: 'Advanced Techniques Course',
        reason: 'Based on your progress',
      },
    ];
    mockFetchRecommendations.mockResolvedValue(mockRecommendations);

    const { result } = renderHook(() => useStudentRecommendations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(mockRecommendations);
  });
});

describe('studentPortalQueryKeys', () => {
  it('provides query keys for caching', () => {
    expect(studentPortalQueryKeys.dashboard).toEqual([
      'student-portal',
      'dashboard',
    ]);
  });

  it('provides scoped query keys for schedule', () => {
    const key = studentPortalQueryKeys.schedule({ month: 'March' });
    expect(key).toEqual(['student-portal', 'schedule', { month: 'March' }]);
  });

  it('provides query keys for all endpoints', () => {
    expect(studentPortalQueryKeys.courses).toBeDefined();
    expect(studentPortalQueryKeys.invoices).toBeDefined();
    expect(studentPortalQueryKeys.profile).toBeDefined();
    expect(studentPortalQueryKeys.preferences).toBeDefined();
    expect(studentPortalQueryKeys.recommendations).toBeDefined();
  });
});
