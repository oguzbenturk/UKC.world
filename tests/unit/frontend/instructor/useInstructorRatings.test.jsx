import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiGet = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/shared/services/apiClient', () => ({
  default: { get: (...args) => mockApiGet(...args) },
}));

vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

import { useInstructorRatings } from '@/features/instructor/hooks/useInstructorRatings';

const makeRatingsResponse = (overrides = {}) => ({
  ratings: [
    {
      id: 'r1',
      studentName: 'Alice',
      rating: 5,
      comment: 'Great instructor!',
      serviceType: 'lesson',
      createdAt: '2025-03-20',
    },
    {
      id: 'r2',
      studentName: 'Bob',
      rating: 4,
      comment: 'Good session',
      serviceType: 'lesson',
      createdAt: '2025-03-15',
    },
  ],
  summary: {
    averageRating: 4.5,
    totalRatings: 2,
  },
  ...overrides,
});

const makeStatsResponse = (overrides = {}) => ({
  distribution: {
    5: 15,
    4: 8,
    3: 2,
    2: 0,
    1: 0,
  },
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

describe('useInstructorRatings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'instructor1' } });
  });

  it('returns empty arrays when instructor ID is not available', async () => {
    mockUseAuth.mockReturnValue({ user: null });

    const { result } = renderHook(() => useInstructorRatings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.ratings).toEqual([]);
    expect(result.current.summary).toBeNull();
  });

  it('fetches ratings and stats for current instructor', async () => {
    mockApiGet.mockImplementation((url) => {
      if (url.includes('/ratings/instructor/')) {
        return Promise.resolve({ data: makeRatingsResponse() });
      }
      if (url.includes('/ratings/stats/')) {
        return Promise.resolve({ data: makeStatsResponse() });
      }
    });

    const { result } = renderHook(() => useInstructorRatings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.ratings).toHaveLength(2);
    expect(result.current.ratings[0].studentName).toBe('Alice');
    expect(result.current.summary.averageRating).toBe(4.5);
    expect(result.current.stats.distribution[5]).toBe(15);
  });

  it('respects enabled flag', async () => {
    mockApiGet.mockResolvedValue({ data: makeRatingsResponse() });

    const { result } = renderHook(
      () => useInstructorRatings({ enabled: false }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('filters by serviceType when provided', async () => {
    mockApiGet.mockImplementation((url) => {
      if (url.includes('/ratings/instructor/')) {
        return Promise.resolve({ data: makeRatingsResponse() });
      }
      if (url.includes('/ratings/stats/')) {
        return Promise.resolve({ data: makeStatsResponse() });
      }
    });

    const { result } = renderHook(
      () => useInstructorRatings({ serviceType: 'rental' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Verify serviceType was passed to API
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringContaining('serviceType=rental')
    );
  });

  it('handles pagination with limit and offset', async () => {
    mockApiGet.mockImplementation((url) => {
      if (url.includes('/ratings/instructor/')) {
        return Promise.resolve({ data: makeRatingsResponse() });
      }
      if (url.includes('/ratings/stats/')) {
        return Promise.resolve({ data: makeStatsResponse() });
      }
    });

    const { result } = renderHook(
      () => useInstructorRatings({ limit: 5, offset: 10 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Verify pagination params were passed
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringContaining('limit=5')
    );
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringContaining('offset=10')
    );
  });

  it('provides refetch method', async () => {
    mockApiGet.mockImplementation((url) => {
      if (url.includes('/ratings/instructor/')) {
        return Promise.resolve({ data: makeRatingsResponse() });
      }
      if (url.includes('/ratings/stats/')) {
        return Promise.resolve({ data: makeStatsResponse() });
      }
    });

    const { result } = renderHook(() => useInstructorRatings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const initialCallCount = mockApiGet.mock.calls.length;

    result.current.refetch();

    await waitFor(() => {
      expect(mockApiGet.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it('defaults to 20 limit and 0 offset', async () => {
    mockApiGet.mockImplementation((url) => {
      if (url.includes('/ratings/instructor/')) {
        return Promise.resolve({ data: makeRatingsResponse() });
      }
      if (url.includes('/ratings/stats/')) {
        return Promise.resolve({ data: makeStatsResponse() });
      }
    });

    const { result } = renderHook(() => useInstructorRatings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringContaining('limit=20')
    );
  });

  it('returns null summary when data is missing', async () => {
    mockApiGet.mockImplementation((url) => {
      if (url.includes('/ratings/instructor/')) {
        return Promise.resolve({ data: { ratings: [] } }); // No summary
      }
      if (url.includes('/ratings/stats/')) {
        return Promise.resolve({ data: {} });
      }
    });

    const { result } = renderHook(() => useInstructorRatings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.summary).toBeNull();
  });
});
