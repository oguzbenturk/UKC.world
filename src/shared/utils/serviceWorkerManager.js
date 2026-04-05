// Service Worker Cleanup and Bypass
class ServiceWorkerManager {
  static async cleanupServiceWorkers() {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        
        for (const registration of registrations) {
          console.log('🧹 Unregistering service worker:', registration.scope);
          await registration.unregister();
        }
        
        console.log('✅ All service workers unregistered');
      }
    } catch (error) {
      console.error('❌ Error cleaning up service workers:', error);
    }
  }

  static async clearAllCache() {
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        
        for (const cacheName of cacheNames) {
          console.log('🧹 Deleting cache:', cacheName);
          await caches.delete(cacheName);
        }
        
        console.log('✅ All caches cleared');
      }
    } catch (error) {
      console.error('❌ Error clearing caches:', error);
    }
  }

  static async fullCleanup() {
    console.log('🧹 Starting full cleanup...');
    
    await this.cleanupServiceWorkers();
    await this.clearAllCache();
    
    // Clear local storage
    localStorage.clear();
    sessionStorage.clear();
    
    console.log('✅ Full cleanup completed');
    
    // Show notification
    const notification = document.createElement('div');
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #10b981;
        color: white;
        padding: 16px;
        border-radius: 8px;
        z-index: 9999;
        font-family: system-ui;
      ">
        🧹 Cache and Service Workers Cleared - Refreshing...
      </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      window.location.reload(true);
    }, 2000);
  }
}

// Make it globally available
window.ServiceWorkerManager = ServiceWorkerManager;

// Add keyboard shortcut for emergency cleanup
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'C') {
    if (confirm('Clear all cache, service workers, and reload?')) {
      ServiceWorkerManager.fullCleanup();
    }
  }
});

export default ServiceWorkerManager;
