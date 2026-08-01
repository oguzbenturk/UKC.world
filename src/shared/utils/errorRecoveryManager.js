// Global error recovery system
class ErrorRecoveryManager {
  constructor() {
    this.setupGlobalErrorHandlers();
    this.setupStaleChunkRecovery();
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
      // A rejected lazy import() after a redeploy is a stale chunk, not a real
      // failure — reload once to pull the fresh assets instead of logging it.
      if (this.isDynamicImportError(event.reason) && this.reloadForStaleChunk()) {
        event.preventDefault();
        return;
      }
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

  // Recover from stale lazy-loaded chunks after a deploy.
  //
  // Frontend redeploys change the content-hashed chunk filenames (e.g.
  // CustomerDiscountsTab-BH17Sk25.js) and delete the old files from the server.
  // A browser tab that was opened BEFORE the deploy still holds the old
  // index.html / module graph in memory, so the next lazy import() 404s with
  // "Failed to fetch dynamically imported module". A one-shot page reload pulls
  // the fresh index.html and its new-hash chunks, silently fixing it.
  //
  // Guarded by sessionStorage: if a reload just happened and the import STILL
  // fails, the chunk is genuinely missing (broken deploy) rather than stale, so
  // we stop reloading and let the ErrorBoundary show its fallback instead of
  // trapping the user in an infinite reload loop.
  setupStaleChunkRecovery() {
    // Vite dispatches this on window when a dynamically-imported module (or its
    // modulepreload) fails to load in a production build.
    window.addEventListener('vite:preloadError', (event) => {
      const reloaded = this.reloadForStaleChunk();
      // Only swallow the error if we're actually reloading. If the loop guard
      // tripped, let Vite rethrow so the ErrorBoundary can render a fallback
      // rather than leaving the user on a stuck spinner.
      if (reloaded && typeof event?.preventDefault === 'function') {
        event.preventDefault();
      }
    });
  }

  isDynamicImportError(error) {
    const msg = error?.message || (error && error.toString?.()) || '';
    return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|dynamically imported module/i.test(msg);
  }

  reloadForStaleChunk() {
    const KEY = 'chunk-reload-attempt';
    const WINDOW_MS = 10000; // reload at most once per 10s
    let last = 0;
    try { last = Number(sessionStorage.getItem(KEY)) || 0; } catch (e) { /* storage blocked */ }
    const now = Date.now();
    if (now - last < WINDOW_MS) {
      console.warn('🚨 Stale-chunk reload already attempted — chunk appears genuinely missing; not reloading again.');
      return false;
    }
    try { sessionStorage.setItem(KEY, String(now)); } catch (e) { /* storage blocked */ }
    console.warn('♻️ Stale chunk detected (likely post-deploy) — reloading to fetch fresh assets.');
    window.location.reload();
    return true;
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
