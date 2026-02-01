// Unit tests for useAuth hook
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '../useAuth';

// Mock apiClient
vi.mock('@/shared/services/apiClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import apiClient from '@/shared/services/apiClient';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('useAuth hook', () => {
  it('should return user data when authenticated', async () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      first_name: 'Test',
      role: 'admin'
    };

    apiClient.get.mockResolvedValueOnce({ data: mockUser });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.user).toBeTruthy();
    });

    expect(result.current.isAuthenticated).toBe(true);
  });

  it('should handle unauthenticated state', async () => {
    apiClient.get.mockRejectedValueOnce(new Error('Unauthorized'));

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('should provide logout function', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper()
    });

    expect(typeof result.current.logout).toBe('function');
  });
});
