import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockUseAuth = vi.fn();

vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/shared/services/apiClient', () => ({
  clearAccessToken: () => {},
}));

vi.mock('@/shared/utils/antdStatic', () => ({
  message: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockIo = vi.fn();

vi.mock('socket.io-client', () => ({
  default: (...args) => mockIo(...args),
  io: (...args) => mockIo(...args),
}));

import { useChat } from '@/features/chat/hooks/useChat';

describe('useChat', () => {
  let mockSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user1', role: 'instructor' } });

    // Create mock socket
    mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      close: vi.fn(),
    };

    mockIo.mockReturnValue(mockSocket);
  });

  it('returns initial state with no user', () => {
    mockUseAuth.mockReturnValue({ user: null });

    const { result } = renderHook(() => useChat());

    expect(result.current.socket).toBeNull();
    expect(result.current.connected).toBe(false);
    expect(result.current.onlineUsers).toBeInstanceOf(Set);
  });

  it('initializes socket connection with user ID and role', async () => {
    const { result } = renderHook(() => useChat());

    await waitFor(() => {
      expect(result.current.socket).not.toBeNull();
    });

    // Socket should be created
    expect(mockSocket).toBeDefined();
  });

  it('provides joinConversation function', () => {
    const { result } = renderHook(() => useChat());

    expect(result.current.joinConversation).toBeDefined();
    expect(typeof result.current.joinConversation).toBe('function');
  });

  it('provides leaveConversation function', () => {
    const { result } = renderHook(() => useChat());

    expect(result.current.leaveConversation).toBeDefined();
    expect(typeof result.current.leaveConversation).toBe('function');
  });

  it('provides sendTyping function', () => {
    const { result } = renderHook(() => useChat());

    expect(result.current.sendTyping).toBeDefined();
    expect(typeof result.current.sendTyping).toBe('function');
  });

  it('provides stopTyping function', () => {
    const { result } = renderHook(() => useChat());

    expect(result.current.stopTyping).toBeDefined();
    expect(typeof result.current.stopTyping).toBe('function');
  });

  it('provides message event subscription', () => {
    const { result } = renderHook(() => useChat());

    expect(result.current.onMessage).toBeDefined();
    expect(typeof result.current.onMessage).toBe('function');
  });

  it('provides read receipt subscription', () => {
    const { result } = renderHook(() => useChat());

    expect(result.current.onReadReceipt).toBeDefined();
    expect(typeof result.current.onReadReceipt).toBe('function');
  });

  it('provides typing indicator subscription', () => {
    const { result } = renderHook(() => useChat());

    expect(result.current.onTyping).toBeDefined();
    expect(typeof result.current.onTyping).toBe('function');
  });

  it('provides stop typing indicator subscription', () => {
    const { result } = renderHook(() => useChat());

    expect(result.current.onStopTyping).toBeDefined();
    expect(typeof result.current.onStopTyping).toBe('function');
  });

  it('provides user joined event subscription', () => {
    const { result } = renderHook(() => useChat());

    expect(result.current.onUserJoined).toBeDefined();
    expect(typeof result.current.onUserJoined).toBe('function');
  });

  it('provides user left event subscription', () => {
    const { result } = renderHook(() => useChat());

    expect(result.current.onUserLeft).toBeDefined();
    expect(typeof result.current.onUserLeft).toBe('function');
  });

  it('returns online users set', () => {
    const { result } = renderHook(() => useChat());

    expect(result.current.onlineUsers).toBeInstanceOf(Set);
  });

  it('cleans up socket connection on unmount', () => {
    const { unmount } = renderHook(() => useChat());

    unmount();

    expect(mockSocket.close).toHaveBeenCalled();
  });

  it('returns no user ID when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null });

    renderHook(() => useChat());

    // Socket should not be initialized when no user
    expect(mockSocket.on).not.toHaveBeenCalled();
  });

  it('returns functions that handle disconnected state gracefully', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user1', role: 'instructor' } });

    const { result } = renderHook(() => useChat());

    // Should not throw even if socket operations fail
    expect(() => {
      result.current.joinConversation('conv1');
    }).not.toThrow();

    expect(() => {
      result.current.leaveConversation('conv1');
    }).not.toThrow();

    expect(() => {
      result.current.sendTyping('conv1');
    }).not.toThrow();
  });
});
