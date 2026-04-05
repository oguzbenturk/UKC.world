import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockFetchInstructorStudents = vi.fn();

vi.mock('@/features/instructor/services/instructorApi', () => ({
  fetchInstructorStudents: (...args) => mockFetchInstructorStudents(...args),
}));

import { useInstructorStudents } from '@/features/instructor/hooks/useInstructorStudents';

const makeStudentList = (overrides = []) => [
  {
    id: 's1',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    level: 'intermediate',
    joinDate: '2025-01-15',
    lessonsCompleted: 10,
  },
  {
    id: 's2',
    name: 'Bob Smith',
    email: 'bob@example.com',
    level: 'beginner',
    joinDate: '2025-03-01',
    lessonsCompleted: 3,
  },
  ...overrides,
];

describe('useInstructorStudents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns loading state initially', () => {
    mockFetchInstructorStudents.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { result } = renderHook(() => useInstructorStudents());

    expect(result.current.loading).toBe(true);
    expect(result.current.students).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('fetches and sets students on mount', async () => {
    const mockStudents = makeStudentList();
    mockFetchInstructorStudents.mockResolvedValue(mockStudents);

    const { result } = renderHook(() => useInstructorStudents());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.students).toEqual(mockStudents);
    expect(result.current.students.length).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it('handles empty student list', async () => {
    mockFetchInstructorStudents.mockResolvedValue([]);

    const { result } = renderHook(() => useInstructorStudents());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.students).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('sets error when API call fails', async () => {
    const errorMsg = 'Failed to load students';
    mockFetchInstructorStudents.mockRejectedValue(new Error(errorMsg));

    const { result } = renderHook(() => useInstructorStudents());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.students).toEqual([]);
    expect(result.current.error).toBe(errorMsg);
  });

  it('provides refetch method to reload students', async () => {
    const mockStudents1 = makeStudentList();
    const mockStudents2 = [
      ...makeStudentList(),
      {
        id: 's3',
        name: 'Charlie Brown',
        email: 'charlie@example.com',
        level: 'advanced',
        joinDate: '2025-02-10',
        lessonsCompleted: 25,
      },
    ];

    mockFetchInstructorStudents.mockResolvedValueOnce(mockStudents1);

    const { result } = renderHook(() => useInstructorStudents());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.students.length).toBe(2);

    mockFetchInstructorStudents.mockResolvedValueOnce(mockStudents2);
    await result.current.refetch();

    await waitFor(() => {
      expect(result.current.students.length).toBe(3);
    });
  });

  it('handles network error gracefully', async () => {
    mockFetchInstructorStudents.mockRejectedValue(
      new Error('Network error')
    );

    const { result } = renderHook(() => useInstructorStudents());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Network error');
    expect(result.current.students).toEqual([]);
  });

  it('has correct data structure for each student', async () => {
    const mockStudents = makeStudentList();
    mockFetchInstructorStudents.mockResolvedValue(mockStudents);

    const { result } = renderHook(() => useInstructorStudents());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const student = result.current.students[0];
    expect(student).toHaveProperty('id');
    expect(student).toHaveProperty('name');
    expect(student).toHaveProperty('email');
    expect(student).toHaveProperty('level');
    expect(student).toHaveProperty('joinDate');
    expect(student).toHaveProperty('lessonsCompleted');
  });
});
