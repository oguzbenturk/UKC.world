// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import Inspector from 'vite-plugin-react-inspector'

const devPort = Number(process.env.VITE_DEV_PORT || process.env.PORT || 3000);
const runtimeNodeEnv = process.env.VITEST ? 'test' : (process.env.NODE_ENV || 'production');

export default defineConfig({
  plugins: [
    react(),
    Inspector({ enabled: process.env.NODE_ENV !== 'production' }),
  ],
  base: '/',
  define: {
    // Prevent service worker registration in development
    __SW_ENABLED__: false,
    // Ensure React is properly defined in production
    'process.env.NODE_ENV': JSON.stringify(runtimeNodeEnv)
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false, // Disable sourcemaps in production for smaller builds
    target: 'es2015', // Better browser compatibility
    minify: 'terser',
    chunkSizeWarningLimit: 1800,
    
    // Enable CSS code splitting
    cssCodeSplit: true,
    
    // Optimize asset handling
    assetsInlineLimit: 4096, // Files smaller than 4kb will be inlined
    rollupOptions: {
      output: {
        // Let Rollup handle chunking automatically to preserve correct
        // module execution order.  Manual vendor splitting caused
        // runtime errors (React undefined in antd / rc-* chunks).
        chunkFileNames: () => {
          return `assets/js/[name]-[hash].js`;
        },
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]'
      }
    },
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  },  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'src': path.resolve(__dirname, 'src')
    }
  },
 
  server: {
    proxy: {
      '/api': {
        target: process.env.BACKEND_API_URL || 'http://localhost:4000',
        changeOrigin: true,
        secure: false
      },
      '/uploads': {
        target: process.env.BACKEND_API_URL || 'http://localhost:4000',
        changeOrigin: true,
        secure: false
      }
    },
  port: devPort,
  strictPort: false,
    host: true,
    // Disable service worker in development
    cors: true,
    headers: {
      'Service-Worker-Allowed': 'none'
    },
    middlewareMode: false,
    // Intercept service worker requests
    middleware: [
      (req, res, next) => {
        if (req.url && (req.url.includes('sw.js') || req.url.includes('service-worker'))) {
          res.status(404).end('Service Worker disabled in development');
          return;
        }
        next();
      }
    ]
  },  preview: {
    port: process.env.FRONTEND_PREVIEW_PORT || 2999,
    strictPort: true,
    host: true
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    coverage: {
      reporter: ['text', 'html', 'clover', 'json']
    }
  },
  // Optimize dependencies
  // Pre-bundle heavy / commonly-used deps on startup so Vite doesn't discover
  // them mid-session and re-optimize (that re-optimization is what causes the
  // "504 Outdated Optimize Dep" errors in the browser). Do NOT set force:true
  // — that wipes the cache every startup and guarantees hash churn.
  optimizeDeps: {
    include: [
      // React core
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-router-dom',
      // UI libraries
      'antd',
      '@ant-design/icons',
      '@headlessui/react',
      '@heroicons/react/24/outline',
      '@heroicons/react/24/solid',
      '@mui/material',
      '@mui/icons-material',
      '@emotion/react',
      '@emotion/styled',
      // Data / state
      '@tanstack/react-query',
      '@tanstack/react-table',
      '@tanstack/react-virtual',
      'axios',
      'socket.io-client',
      // Dates / numbers
      'dayjs',
      'date-fns',
      'moment',
      'decimal.js',
      // Forms / validation
      'react-hook-form',
      '@hookform/resolvers',
      'yup',
      // Charts / viz / perf
      'recharts',
      'web-vitals',
      'framer-motion',
      'react-big-calendar',
      // Misc commonly-used
      'uuid',
      'dompurify',
    ],
    exclude: ['@vite/client', '@vite/env'],
  },
})