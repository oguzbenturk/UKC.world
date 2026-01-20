// Global error recovery system
class ErrorRecoveryManager {
  constructor() {
    this.setupGlobalErrorHandlers();
    this.loadingTimeouts = new Map();
    this.maxLoadingTime = 15000; // 15 seconds
    
    // Clean up service workers in development
    if (import.meta.env.DEV) {
      this.cleanupServiceWorkers();
    }
  }

  async cleanupServiceWorkers() {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          console.log('🧹 Cleaning up service worker:', registration.scope);
          await registration.unregister();
        }
        if (registrations.length > 0) {
          console.log('✅ Service workers cleaned up');
        }
      }
    } catch (error) {
      console.warn('Service worker cleanup failed:', error);
    }
  }

  setupGlobalErrorHandlers() {
    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      console.error('🚨 Unhandled Promise Rejection:', event.reason);
      this.handleError(event.reason);
      event.preventDefault();
    });

    // Catch global errors
    window.addEventListener('error', (event) => {
      console.error('🚨 Global Error:', event.error);
      this.handleError(event.error);
    });

    // Custom loading timeout system
    window.addEventListener('loadingStarted', (event) => {
      this.startLoadingTimeout(event.detail.component);
    });

    window.addEventListener('loadingFinished', (event) => {
      this.clearLoadingTimeout(event.detail.component);
    });
  }

  handleError(error) {
    // Dispatch custom error event for components to handle
    window.dispatchEvent(new CustomEvent('globalError', {
      detail: { error, timestamp: Date.now() }
    }));

    // Force reset loading states after critical errors
    if (this.isCriticalError(error)) {
      setTimeout(() => {
        this.forceResetAll();
      }, 1000);
    }
  }

  isCriticalError(error) {
    const criticalPatterns = [
      'Network Error',
      'TypeError: Cannot read',
      'AuthContext',
      'DataContext',
      'fetch',
      'CORS'
    ];

    const errorString = error?.toString() || '';
    return criticalPatterns.some(pattern => 
      errorString.includes(pattern)
    );
  }

  startLoadingTimeout(component) {
    const timeoutId = setTimeout(() => {
      console.warn(`🚨 Loading timeout for ${component}`);
      this.forceResetComponent(component);
    }, this.maxLoadingTime);

    this.loadingTimeouts.set(component, timeoutId);
  }

  clearLoadingTimeout(component) {
    const timeoutId = this.loadingTimeouts.get(component);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.loadingTimeouts.delete(component);
    }
  }

  forceResetComponent(component) {
    window.dispatchEvent(new CustomEvent('forceResetComponent', {
      detail: { component }
    }));
  }

  forceResetAll() {
    console.log('🚨 FORCE RESET ALL - Emergency recovery');
    
    // Clear all timeouts
    this.loadingTimeouts.forEach(clearTimeout);
    this.loadingTimeouts.clear();

    // Dispatch global reset
    window.dispatchEvent(new CustomEvent('forceLoadingReset'));

    // Show user notification
    this.showRecoveryNotification();
  }

  showRecoveryNotification() {
    const notification = document.createElement('div');
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ef4444;
        color: white;
        padding: 16px;
        border-radius: 8px;
        z-index: 9999;
        font-family: system-ui;
        max-width: 300px;
      ">
        <strong>System Recovery</strong><br>
        The app encountered an error and has been automatically reset.
        <button onclick="this.parentElement.remove()" style="
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          margin-left: 8px;
          cursor: pointer;
        ">×</button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 5000);
  }
}

// Initialize the error recovery manager
window.errorRecoveryManager = new ErrorRecoveryManager();

export default window.errorRecoveryManager;
