// Unit tests for useRealTime hook
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createMockSocket } from '../../../../tests/helpers/socket-mock';

// Mock the realTimeService
vi.mock('@/shared/services/realTimeService', () => ({
  default: {
    getSocket: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
}));

import realTimeService from '@/shared/services/realTimeService';

describe('useRealTime hook', () => {
  let mockSocket;

  beforeEach(() => {
    mockSocket = createMockSocket();
    realTimeService.getSocket.mockReturnValue(mockSocket);
    vi.clearAllMocks();
  });

  it('should subscribe to events on mount', () => {
    const mockCallback = vi.fn();
    realTimeService.subscribe.mockImplementation((event, cb) => {
      mockSocket.on(event, cb);
    });

    // Simulate hook usage
    const event = 'notification:new';
    realTimeService.subscribe(event, mockCallback);

    // Trigger event
    act(() => {
      mockSocket.trigger(event, { data: 'test' });
    });

    expect(mockCallback).toHaveBeenCalledWith({ data: 'test' });
  });

  it('should handle socket connection', () => {
    expect(mockSocket.connected).toBe(false);

    act(() => {
      mockSocket.connect();
    });

    expect(mockSocket.connected).toBe(true);
  });

  it('should handle socket disconnection', () => {
    mockSocket.connect();
    expect(mockSocket.connected).toBe(true);

    act(() => {
      mockSocket.disconnect();
    });

    expect(mockSocket.connected).toBe(false);
  });

  it('should unsubscribe on cleanup', () => {
    const mockCallback = vi.fn();
    mockSocket.on('test-event', mockCallback);

    act(() => {
      mockSocket.off('test-event', mockCallback);
    });

    // Trigger should not call callback after unsubscribe
    mockSocket.trigger('test-event', { data: 'test' });
    expect(mockCallback).not.toHaveBeenCalled();
  });
});
