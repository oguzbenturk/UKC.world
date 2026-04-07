import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Mock the API module ───────────────────────────────────────────────────
const mockFetchMyAvailability = vi.fn();
const mockRequestTimeOff = vi.fn();
const mockCancelMyTimeOffRequest = vi.fn();

vi.mock('@/features/instructor/services/instructorAvailabilityApi', () => ({
  fetchMyAvailability: (...args) => mockFetchMyAvailability(...args),
  requestTimeOff: (...args) => mockRequestTimeOff(...args),
  cancelMyTimeOffRequest: (...args) => mockCancelMyTimeOffRequest(...args),
}));

import { useInstructorAvailability } from '@/features/instructor/hooks/useInstructorAvailability';

// ── Fixtures ──────────────────────────────────────────────────────────────
const makeEntry = (overrides = {}) => ({
  id: 'entry-uuid-1',
  instructor_id: 'instructor-uuid',
  start_date: '2099-06-01',
  end_date: '2099-06-01',
  type: 'off_day',
  status: 'pending',
  reason: null,
  created_at: new Date().toISOString(),
  ...overrides,
});

describe('useInstructorAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── load() ───────────────────────────────────────────────────────────────

  it('starts with empty entries and no error', () => {
    mockFetchMyAvailability.mockImplementation(() => new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useInstructorAvailability());

    expect(result.current.entries).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('load() fetches and sets entries', async () => {
    const mockData = [makeEntry(), makeEntry({ id: 'entry-uuid-2', status: 'approved' })];
    mockFetchMyAvailability.mockResolvedValue(mockData);

    const { result } = renderHook(() => useInstructorAvailability());

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.entries).toEqual(mockData);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockFetchMyAvailability).toHaveBeenCalledTimes(1);
  });

  it('load() sets error state when API fails', async () => {
    mockFetchMyAvailability.mockRejectedValue({
      response: { data: { error: 'Unauthorized' } },
    });

    const { result } = renderHook(() => useInstructorAvailability());

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.error).toBe('Unauthorized');
    expect(result.current.entries).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  // ── requestOff() ─────────────────────────────────────────────────────────

  it('requestOff() calls API with payload and prepends entry to state', async () => {
    const newEntry = makeEntry({ id: 'new-uuid', status: 'pending' });
    mockRequestTimeOff.mockResolvedValue(newEntry);
    // Pre-populate with an existing entry
    mockFetchMyAvailability.mockResolvedValue([makeEntry({ id: 'existing-uuid' })]);

    const { result } = renderHook(() => useInstructorAvailability());

    await act(async () => {
      await result.current.load();
    });

    const payload = { start_date: '2099-06-01', end_date: '2099-06-01', type: 'off_day' };
    await act(async () => {
      await result.current.requestOff(payload);
    });

    expect(mockRequestTimeOff).toHaveBeenCalledWith(payload);
    expect(result.current.entries[0]).toEqual(newEntry);
    expect(result.current.entries).toHaveLength(2);
  });

  // ── cancel() ─────────────────────────────────────────────────────────────

  it('cancel() calls API and updates entry status in state', async () => {
    const existingEntry = makeEntry({ id: 'cancel-uuid', status: 'pending' });
    const cancelledEntry = { ...existingEntry, status: 'cancelled' };
    mockFetchMyAvailability.mockResolvedValue([existingEntry]);
    mockCancelMyTimeOffRequest.mockResolvedValue(cancelledEntry);

    const { result } = renderHook(() => useInstructorAvailability());

    await act(async () => {
      await result.current.load();
    });

    await act(async () => {
      await result.current.cancel('cancel-uuid');
    });

    expect(mockCancelMyTimeOffRequest).toHaveBeenCalledWith('cancel-uuid');
    expect(result.current.entries[0].status).toBe('cancelled');
  });

  it('cancel() propagates API errors', async () => {
    const existingEntry = makeEntry({ id: 'fail-uuid', status: 'approved' });
    mockFetchMyAvailability.mockResolvedValue([existingEntry]);
    mockCancelMyTimeOffRequest.mockRejectedValue({
      response: { data: { error: 'Cannot cancel an already-approved entry' } },
    });

    const { result } = renderHook(() => useInstructorAvailability());

    await act(async () => {
      await result.current.load();
    });

    await expect(
      act(async () => {
        await result.current.cancel('fail-uuid');
      })
    ).rejects.toMatchObject({ response: { data: { error: 'Cannot cancel an already-approved entry' } } });

    // Entry should remain unchanged
    expect(result.current.entries[0].status).toBe('approved');
  });
});
