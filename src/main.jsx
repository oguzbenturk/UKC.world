/* eslint-disable no-unused-vars, no-console */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import { App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'antd/dist/reset.css';
import '@/index.css';
import { i18nReady } from '@/i18n';
import AppLocaleProvider from '@/i18n/AppLocaleProvider';
import ErrorBoundary from '@/shared/components/error/ErrorBoundary';
import AppErrorFallback from '@/shared/components/error/AppErrorFallback';
// Silence console noise by default (opt-in to debug via localStorage.DEBUG_CONSOLE='1')
// import '@/shared/utils/silenceConsole.js'; // Temporarily disabled for debugging

// Initialize error recovery system
import './shared/utils/errorRecoveryManager.js';

// Prevent service worker registration errors in development
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  // Clean up any existing service workers
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for (const registration of registrations) {
      console.log('🧹 Removing existing service worker:', registration.scope);
      registration.unregister();
    }
  }).catch(console.warn);
  
  // Override service worker registration to prevent errors
  const originalRegister = navigator.serviceWorker.register;
  navigator.serviceWorker.register = function() {
    console.warn('Service Worker registration blocked in development');
    return Promise.reject(new Error('Service Worker disabled in development'));
  };
}

// Temporarily disable service worker manager to fix development errors
// import './shared/utils/serviceWorkerManager.js';

// Debug HMR for refresh cycles
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', (data) => {

  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000
    }
  }
});

const mount = () => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    // StrictMode temporarily disabled to troubleshoot refresh issues
    <ErrorBoundary
      fallback={AppErrorFallback}
      showDetails={import.meta.env.DEV}
    >
      <AppLocaleProvider
        theme={{
          token: {
            colorPrimary: '#3B82F6', // brand blue
            colorInfo: '#3B82F6',
            colorSuccess: '#10B981', // emerald
            colorWarning: '#F59E0B', // amber
          },
          components: {
            Button: {
              colorPrimaryHover: '#3B82F6',   // same as colorPrimary → no blue shift on hover
              colorPrimaryActive: '#2563EB',
            }
          }
        }}
      >
        <AntdApp>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </AntdApp>
      </AppLocaleProvider>
    </ErrorBoundary>
  );
};

// Wait for i18n to finish loading its namespaces before mounting so the UI never
// flashes raw translation keys. If loading fails, mount anyway so the app still works.
i18nReady.then(mount, mount);