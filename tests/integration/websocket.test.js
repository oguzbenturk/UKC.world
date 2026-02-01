// Integration tests for WebSocket/Socket.IO
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockSocket } from '../helpers/socket-mock';

describe('WebSocket Integration', () => {
  let socket;

  beforeEach(() => {
    socket = createMockSocket();
  });

  afterEach(() => {
    if (socket.connected) {
      socket.disconnect();
    }
  });

  describe('Connection', () => {
    it('should establish socket connection', () => {
      expect(socket.connected).toBe(false);
      
      socket.connect();
      
      expect(socket.connected).toBe(true);
    });

    it('should handle disconnection', () => {
      socket.connect();
      expect(socket.connected).toBe(true);
      
      socket.disconnect();
      
      expect(socket.connected).toBe(false);
    });

    it('should trigger connect event', () => {
      const connectHandler = vi.fn();
      socket.on('connect', connectHandler);
      
      socket.connect();
      
      expect(connectHandler).toHaveBeenCalled();
    });
  });

  describe('Event Handling', () => {
    it('should receive notification events', () => {
      const notificationHandler = vi.fn();
      socket.on('notification:new', notificationHandler);
      
      const mockNotification = {
        id: 'notif-123',
        title: 'Test Notification',
        message: 'This is a test'
      };
      
      socket.trigger('notification:new', mockNotification);
      
      expect(notificationHandler).toHaveBeenCalledWith(mockNotification);
    });

    it('should receive booking updates', () => {
      const bookingHandler = vi.fn();
      socket.on('booking:updated', bookingHandler);
      
      const mockBooking = {
        id: 'booking-123',
        status: 'confirmed'
      };
      
      socket.trigger('booking:updated', mockBooking);
      
      expect(bookingHandler).toHaveBeenCalledWith(mockBooking);
    });

    it('should handle chat messages', () => {
      const messageHandler = vi.fn();
      socket.on('message:new', messageHandler);
      
      const mockMessage = {
        id: 'msg-123',
        text: 'Hello',
        sender_id: 'user-1'
      };
      
      socket.trigger('message:new', mockMessage);
      
      expect(messageHandler).toHaveBeenCalledWith(mockMessage);
    });
  });

  describe('Event Unsubscription', () => {
    it('should remove event listeners', () => {
      const handler = vi.fn();
      socket.on('test-event', handler);
      
      socket.off('test-event', handler);
      socket.trigger('test-event', { data: 'test' });
      
      expect(handler).not.toHaveBeenCalled();
    });

    it('should allow multiple listeners for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      socket.on('test-event', handler1);
      socket.on('test-event', handler2);
      
      socket.trigger('test-event', { data: 'test' });
      
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('Real-time Synchronization', () => {
    it('should sync wallet balance updates', () => {
      const balanceHandler = vi.fn();
      socket.on('wallet:balance-updated', balanceHandler);
      
      const mockBalance = {
        user_id: 'user-123',
        available: 1000,
        pending: 50
      };
      
      socket.trigger('wallet:balance-updated', mockBalance);
      
      expect(balanceHandler).toHaveBeenCalledWith(mockBalance);
    });

    it('should broadcast booking availability changes', () => {
      const availabilityHandler = vi.fn();
      socket.on('availability:changed', availabilityHandler);
      
      const mockChange = {
        date: '2026-02-15',
        instructor_id: 'instr-1',
        available_slots: 2
      };
      
      socket.trigger('availability:changed', mockChange);
      
      expect(availabilityHandler).toHaveBeenCalledWith(mockChange);
    });
  });
});
