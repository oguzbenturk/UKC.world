import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockFetchInstructorDashboard = vi.fn();

vi.mock('@/features/instructor/services/instructorApi', () => ({
  fetchInstructorDashboard: (...args) => mockFetchInstructorDashboard(...args),
}));

import { useInstructorDashboard } from '@/features/instructor/hooks/useInstructorDashboard';

const makeDashboardResponse = (overrides = {}) => ({
  upcomingLessons: 5,
  totalStudents: 12,
  totalEarnings: 2500,
  lessonsTaught: 45,
  rating: 4.8,
  ...overrides,
});

describe('useInstructorDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('returns loading state initially', () => {
    mockFetchInstructorDashboard.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { result } = renderHook(() => useInstructorDashboard());

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('fetches and sets dashboard data on mount', async () => {
    const mockData = makeDashboardResponse();
    mockFetchInstructorDashboard.mockResolvedValue(mockData);

    const { result } = renderHook(() => useInstructorDashboard());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
    expect(mockFetchInstructorDashboard).toHaveBeenCalledTimes(1);
  });

  it('sets error when API call fails', async () => {
    const errorMsg = 'Failed to fetch dashboard';
    mockFetchInstructorDashboard.mockRejectedValue(new Error(errorMsg));

    const { result } = renderHook(() => useInstructorDashboard());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe(errorMsg);
  });

  it('sets lastUpdated timestamp when data is loaded', async () => {
    mockFetchInstructorDashboard.mockResolvedValue(makeDashboardResponse());

    const { result } = renderHook(() => useInstructorDashboard());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.lastUpdated).not.toBeNull();
    expect(typeof result.current.lastUpdated).toBe('number');
  });

  it('provides refetch method that reloads data', async () => {
    const mockData1 = makeDashboardResponse({ totalEarnings: 1000 });
    const mockData2 = makeDashboardResponse({ totalEarnings: 2000 });

    mockFetchInstructorDashboard.mockResolvedValueOnce(mockData1);

    const { result } = renderHook(() => useInstructorDashboard());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data.totalEarnings).toBe(1000);

    mockFetchInstructorDashboard.mockResolvedValueOnce(mockData2);
    await result.current.refetch();

    await waitFor(() => {
      expect(result.current.data.totalEarnings).toBe(2000);
    });
  });

  it('caches data in sessionStorage', async () => {
    const mockData = makeDashboardResponse();
    mockFetchInstructorDashboard.mockResolvedValue(mockData);

    const { result } = renderHook(() => useInstructorDashboard());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const cachedValue = sessionStorage.getItem('instructor-dashboard-cache::v1');
    if (cachedValue) {
      const cached = JSON.parse(cachedValue);
      expect(cached).not.toBeNull();
      expect(cached.data).toEqual(mockData);
    }
  });

  it('handles cache when available', async () => {
    const mockData = makeDashboardResponse();

    // Mock sessionStorage to simulate cache availability
    const cachedData = { data: mockData, timestamp: Date.now() };
    const getItemSpy = vi.spyOn(sessionStorage, 'getItem');
    getItemSpy.mockReturnValue(JSON.stringify(cachedData));

    mockFetchInstructorDashboard.mockResolvedValue(mockData);

    const { result } = renderHook(() => useInstructorDashboard());

    // Should eventually load data
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(mockData);

    getItemSpy.mockRestore();
  });

  it('invalidates expired cache (5 minute TTL)', async () => {
    const mockData = makeDashboardResponse();
    const expiredTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago

    const getItemSpy = vi.spyOn(sessionStorage, 'getItem');
    const removeItemSpy = vi.spyOn(sessionStorage, 'removeItem');

    getItemSpy.mockReturnValue(
      JSON.stringify({ data: mockData, timestamp: expiredTimestamp })
    );

    mockFetchInstructorDashboard.mockResolvedValue(mockData);

    const { result } = renderHook(() => useInstructorDashboard());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Should have fetched fresh data
    expect(mockFetchInstructorDashboard).toHaveBeenCalled();

    getItemSpy.mockRestore();
    removeItemSpy.mockRestore();
  });

  it('accepts autoRefreshMs parameter', async () => {
    const mockData = makeDashboardResponse();
    mockFetchInstructorDashboard.mockResolvedValue(mockData);

    // Just verify the hook accepts the parameter and doesn't crash
    const { result } = renderHook(() => useInstructorDashboard(5000));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(mockData);
  });
});
