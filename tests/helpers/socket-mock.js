/**
 * Mock socket helper for websocket integration tests.
 * Provides a fake socket object with the same interface as socket.io-client.
 */

export function createMockSocket() {
  const listeners = {};

  const socket = {
    connected: false,
    id: 'mock-socket-id',

    connect() {
      this.connected = true;
      this._trigger('connect');
      return this;
    },

    disconnect() {
      this.connected = false;
      this._trigger('disconnect');
      return this;
    },

    on(event, handler) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
      return this;
    },

    off(event, handler) {
      if (!listeners[event]) return this;
      if (handler) {
        listeners[event] = listeners[event].filter(h => h !== handler);
      } else {
        delete listeners[event];
      }
      return this;
    },

    emit(event, ...args) {
      return this;
    },

    /** Trigger an event as if received from the server (for testing). */
    _trigger(event, ...args) {
      (listeners[event] || []).forEach(handler => handler(...args));
    },
  };

  return socket;
}
