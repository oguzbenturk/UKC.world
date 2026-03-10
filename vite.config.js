// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const devPort = Number(process.env.VITE_DEV_PORT || process.env.PORT || 3000);
const runtimeNodeEnv = process.env.VITEST ? 'test' : (process.env.NODE_ENV || 'production');

const normalizeModuleId = (id) => id.replace(/\\/g, '/');

const getPackageName = (id) => {
  const normalizedId = normalizeModuleId(id);
  const [, modulePath = ''] = normalizedId.split('node_modules/');
  const segments = modulePath.split('/');

  if (!segments[0]) {
    return undefined;
  }

  return segments[0].startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];
};

const sanitizeChunkName = (name) => name.replace(/^@/, '').replace(/[\/]/g, '-');

const getVendorChunkName = (id) => {
  const normalizedId = normalizeModuleId(id);

  if (!normalizedId.includes('node_modules')) {
    return undefined;
  }

  const packageName = getPackageName(normalizedId);

  if (!packageName) {
    return 'vendor';
  }

  if (packageName === 'react' || packageName === 'react-dom' || packageName === 'scheduler' || packageName === 'react-router' || packageName === 'react-router-dom') {
    return 'framework';
  }

  if (packageName === 'antd') {
    return 'antd-core';
  }

  if (packageName.startsWith('@ant-design/')) {
    return `antd-${sanitizeChunkName(packageName)}`;
  }

  if (packageName.startsWith('rc-')) {
    return `antd-${sanitizeChunkName(packageName)}`;
  }

  if (packageName.startsWith('@tanstack/')) {
    return 'tanstack';
  }

  if (packageName === 'recharts' || packageName.startsWith('d3-') || packageName.startsWith('victory')) {
    return 'charts';
  }

  if (packageName === 'jspdf' || packageName === 'jspdf-autotable' || packageName === 'html2canvas') {
    return 'pdf-export';
  }

  if (packageName === 'tinymce' || packageName === '@tinymce/tinymce-react' || packageName === 'react-quill' || packageName === 'quill') {
    return 'editors';
  }

  if (packageName === 'react-big-calendar' || packageName === 'react-calendar-timeline' || packageName === 'dayjs' || packageName === 'date-fns' || packageName === 'moment') {
    return 'calendar';
  }

  if (packageName.startsWith('@mui/') || packageName.startsWith('@emotion/')) {
    return 'mui';
  }

  if (packageName === 'xlsx' || packageName === 'decimal.js' || packageName === 'axios' || packageName === 'socket.io-client' || packageName === 'libphonenumber-js' || packageName === 'uuid') {
    return 'data-utils';
  }

  return 'vendor';
};

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
        // Split only third-party dependencies to reduce the main entry bundle
        // without reordering application modules.
        manualChunks: getVendorChunkName,
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