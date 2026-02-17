// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const devPort = Number(process.env.VITE_DEV_PORT || process.env.PORT || 3000);
const runtimeNodeEnv = process.env.VITEST ? 'test' : (process.env.NODE_ENV || 'production');

export default defineConfig({
  plugins: [react()],  
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
    chunkSizeWarningLimit: 1600, // Increased limit to reduce warnings for large libraries
    
    // Enable CSS code splitting
    cssCodeSplit: true,
    
    // Optimize asset handling
    assetsInlineLimit: 4096, // Files smaller than 4kb will be inlined
    rollupOptions: {
      output: {
        // COMPLETELY DISABLE manual chunking to prevent initialization order issues
        manualChunks: undefined,
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
      'src': path.resolve(__dirname, 'src'),
      '@/Images': path.resolve(__dirname, 'Images')
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
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom', 
      'antd',
      '@ant-design/icons',
      'axios',
    ],
    exclude: ['@vite/client', '@vite/env'],
    // Force bundling React context dependencies together
    force: true
  },
})