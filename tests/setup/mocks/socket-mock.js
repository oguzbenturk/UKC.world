// Socket.IO mock for testing
import { vi } from 'vitest';

export class MockSocket {
  constructor() {
    this.callbacks = {};
    this.connected = false;
    this.id = 'mock-socket-id';
  }

  on(event, callback) {
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
    }
    this.callbacks[event].push(callback);
    return this;
  }

  off(event, callback) {
    if (this.callbacks[event]) {
      this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
    }
    return this;
  }

  emit(event, data) {
    // Mock emit - in real tests, you'd simulate server response
    return this;
  }

  connect() {
    this.connected = true;
    this.trigger('connect');
    return this;
  }

  disconnect() {
    this.connected = false;
    this.trigger('disconnect');
    return this;
  }

  // Helper to trigger events (for test simulation)
  trigger(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(callback => callback(data));
    }
  }
}

export function createMockSocket() {
  return new MockSocket();
}

// Mock io function
export function mockSocketIO() {
  return vi.fn(() => createMockSocket());
}
