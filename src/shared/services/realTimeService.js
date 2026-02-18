// src/shared/services/realTimeService.js
import { io } from 'socket.io-client';
import { getAccessToken, resolveApiBaseUrl } from './apiClient';
// authService not used; keep service lean for silent operation

class RealTimeService {  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.eventListeners = new Map();
    this.latency = 0;
    // Cache for server stats
    this._cachedStats = null;
    this._lastStatsTime = 0;
  // Pending auth user to authenticate right after connect
  this._pendingAuthUser = null;
  }

  /**
   * Connect to the WebSocket server
   */
  async connect() {
    if (this.isConnected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      let serverUrl = '';
      if (import.meta.env.PROD) {
        serverUrl = typeof window !== 'undefined' ? window.location.origin : '';
      } else {
        serverUrl = resolveApiBaseUrl();
      }

      this.socket = io(serverUrl || undefined, {
        transports: ['websocket', 'polling'],
        upgrade: true,
        rememberUpgrade: true,
        timeout: 10000,
        forceNew: true
      });
      this.setupEventHandlers();
      // Cache user for auth on connect (since emit requires an open connection)
      try {
        const token = getAccessToken();
        const storedUser = localStorage.getItem('user');
        if (token && storedUser) {
          this._pendingAuthUser = JSON.parse(storedUser);
        } else {
          this._pendingAuthUser = null;
        }
      } catch {
        this._pendingAuthUser = null;
      }
      // Silent connection attempt - no console output unless error
  } catch {
  // Silent failure; connection will be retried by caller if needed
      this.isConnecting = false;
    }
  }

  /**
   * Setup socket event handlers
   */
  setupEventHandlers() {
    this.socket.on('connect', () => {
      // Silent connection - no console output
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;

      // Attach any previously registered event listeners
      try {
        this.eventListeners.forEach((handlers, event) => {
          handlers.forEach((cb) => {
            this.socket.on(event, cb);
          });
        });
      } catch {}

      // Join general channel early to receive broadcast events
      this.subscribe(['general']);

      // Authenticate immediately if we have a cached user
      if (this._pendingAuthUser) {
        this.authenticate(this._pendingAuthUser);
      }

      // Start latency monitoring
      this.startLatencyMonitoring();
    });
  this.socket.on('disconnect', () => {
      // Silent disconnect - only log if it's an unexpected error
      this.isConnected = false;
      this.handleReconnection();
    });
  this.socket.on('authenticated', () => {
      // Silent authentication - no console output
      this.subscribe(['general', 'dashboard']);
    });

  this.socket.on('auth_error', () => {
  // Silent auth error
    });

    this.socket.on('pong', (data) => {
      this.latency = Date.now() - data.timestamp;
    });

    this.socket.on('connect_error', () => {
      // Reduce console noise for connection errors
      // No console output
      this.handleReconnection();
    });
  }

  /**
   * Authenticate with the server
   */
  authenticate(userData) {
    if (this.socket && this.isConnected) {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      this.socket.emit('authenticate', {
        token
      });
  // Clear pending auth once sent
  this._pendingAuthUser = null;
    }
  }

  /**
   * Subscribe to channels
   */
  subscribe(channels) {
    if (this.socket && this.isConnected) {
      this.socket.emit('subscribe', channels);
    }
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event).add(callback);

  // Add socket listener if a socket exists (connected or connecting)
  if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).delete(callback);
      
      // Remove socket listener if connected
      if (this.socket) {
        this.socket.off(event, callback);
      }
    }
  }

  /**
   * Handle reconnection logic
   */  handleReconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      
      // Silent reconnection attempts
      setTimeout(() => {
        if (!this.isConnected) {
          this.connect();
        }
      }, delay);
    } else {
      // Give up silently after max attempts - the app will work fine without WebSocket
      this.isConnecting = false;
    }
  }

  /**
   * Start latency monitoring
   */
  startLatencyMonitoring() {
    setInterval(() => {
      if (this.isConnected) {
        this.socket.emit('ping', { timestamp: Date.now() });
      }
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.isConnecting = false;
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      latency: this.latency,
      reconnectAttempts: this.reconnectAttempts
    };
  }
  /**
   * Get server statistics with caching to prevent rate limiting
   */
  async getServerStats() {
    // Cache stats for 2 minutes to reduce API calls
    const now = Date.now();
    if (this._lastStatsTime && (now - this._lastStatsTime) < 120000) {
      return this._cachedStats;
    }

    try {
      const response = await fetch('/api/socket/stats', {
        credentials: 'include'
      });
      const stats = await response.json();
      
      // Cache the result
      this._cachedStats = stats;
      this._lastStatsTime = now;
      
      return stats;
  } catch {
  // Silent failure
      return this._cachedStats || null;
    }
  }
}

// Export singleton instance
export const realTimeService = new RealTimeService();
export default realTimeService;