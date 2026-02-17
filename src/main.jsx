/* eslint-disable no-unused-vars, no-console */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import { ConfigProvider, App as AntdApp } from 'antd';
import enUS from 'antd/locale/en_US';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'antd/dist/reset.css';
import '@/index.css';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import ErrorBoundary from '@/shared/components/error/ErrorBoundary';
import AppErrorFallback from '@/shared/components/error/AppErrorFallback';

// Set dayjs locale to English (Gregorian calendar)
dayjs.locale('en');
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
      retry: 1
    }
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode temporarily disabled to troubleshoot refresh issues
  <ErrorBoundary
    fallback={AppErrorFallback}
    showDetails={import.meta.env.DEV}
  >
    <ConfigProvider
      locale={enUS}
      theme={{
        token: {
          colorPrimary: '#3B82F6', // brand blue
          colorInfo: '#3B82F6',
          colorSuccess: '#10B981', // emerald
          colorWarning: '#F59E0B', // amber
        }
      }}
    >
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  </ErrorBoundary>
);