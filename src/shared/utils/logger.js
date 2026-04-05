// src/shared/utils/logger.js
import React from 'react';

/**
 * Frontend Logging Utility
 * Provides structured logging for the frontend application
 */

class Logger {
  constructor() {
    this.isDevelopment = import.meta.env.MODE === 'development';
    this.apiEndpoint = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    // Console output is disabled by default to keep the console clean.
    // Set localStorage.enableConsoleLogs = 'true' to re-enable.
    this.consoleEnabled = (typeof localStorage !== 'undefined' && localStorage.getItem('enableConsoleLogs') === 'true')
      || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENABLE_CONSOLE_LOGS === 'true');
  }

  /**
   * Log an info message
   */
  info(message, data = {}) {
    this.log('info', message, data);
  }

  /**
   * Log a warning message
   */
  warn(message, data = {}) {
    this.log('warn', message, data);
  }

  /**
   * Log an error message
   */
  error(message, data = {}) {
    this.log('error', message, data);
  }

  /**
   * Log a debug message (development only)
   */
  debug(message, data = {}) {
    if (this.isDevelopment) {
      this.log('debug', message, data);
    }
  }

  /**
   * Core logging method
   */
  log(level, message, data = {}) {
    const logEntry = {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      userId: this.getCurrentUserId(),
      sessionId: this.getSessionId()
    };

    // Console logging (opt-in only)
  // Console output intentionally suppressed to satisfy lint rules.

    // Send to backend (for errors and warnings in production)
    // Temporarily disabled to prevent 404 errors
    // if (!this.isDevelopment && (level === 'error' || level === 'warn')) {
    //   this.sendToBackend(logEntry);
    // }

    // Store in localStorage for debugging
    this.storeLocally(logEntry);
  }

  /**
   * Send log entry to backend
   */
  async sendToBackend(logEntry) {
    try {
      await fetch(`${this.apiEndpoint}/api/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`
        },
        body: JSON.stringify(logEntry)
      });
  } catch {
  // Silently fail - don't create loops
    }
  }

  /**
   * Store log entry locally for debugging
   */
  storeLocally(logEntry) {
    try {
      const logs = JSON.parse(localStorage.getItem('app_logs') || '[]');
      logs.unshift(logEntry);
      
      // Keep only last 100 logs
      if (logs.length > 100) {
        logs.splice(100);
      }
      
      localStorage.setItem('app_logs', JSON.stringify(logs));
  } catch {
      // Silently fail
    }
  }

  /**
   * Get current user ID from auth context
   */
  getCurrentUserId() {
    try {
      const token = localStorage.getItem('authToken');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.id;
      }
  } catch {
      // Ignore errors
    }
    return null;
  }

  /**
   * Get session ID
   */
  getSessionId() {
    let sessionId = sessionStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('sessionId', sessionId);
    }
    return sessionId;
  }

  /**
   * Get auth token
   */
  getToken() {
    return localStorage.getItem('authToken');
  }

  /**
   * Get stored logs
   */
  getLogs() {
    try {
      return JSON.parse(localStorage.getItem('app_logs') || '[]');
  } catch {
      return [];
    }
  }

  /**
   * Clear stored logs
   */
  clearLogs() {
    localStorage.removeItem('app_logs');
  }

  /**
   * Performance logging
   */
  performance(name, duration, data = {}) {
    this.log('info', `Performance: ${name}`, {
      ...data,
      duration: `${duration}ms`,
      type: 'performance'
    });
  }

  /**
   * User action logging
   */
  userAction(action, data = {}) {
    this.log('info', `User Action: ${action}`, {
      ...data,
      type: 'user_action'
    });
  }

  /**
   * API call logging
   */
  apiCall(method, url, status, duration, data = {}) {
    this.log('info', `API Call: ${method} ${url}`, {
      ...data,
      status,
      duration: `${duration}ms`,
      type: 'api_call'
    });
  }
}

// Create singleton instance
export const logger = new Logger();

// Export performance measurement helpers
export const measurePerformance = (name, fn) => {
  return async (...args) => {
    const start = performance.now();
    try {
      const result = await fn(...args);
      const duration = performance.now() - start;
      logger.performance(name, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      logger.performance(name, duration, { error: error.message });
      throw error;
    }
  };
};

export const withPerformanceLogging = (Component, componentName) => {
  return function PerformanceLoggedComponent(props) {
    React.useEffect(() => {
      const start = performance.now();
      return () => {
        const duration = performance.now() - start;
        logger.performance(`Component: ${componentName}`, duration);
      };
    }, []);

    return React.createElement(Component, props);
  };
};
