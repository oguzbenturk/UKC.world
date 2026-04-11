// vite.config.js
import { defineConfig } from "file:///D:/UKC.world/node_modules/vite/dist/node/index.js";
import react from "file:///D:/UKC.world/node_modules/@vitejs/plugin-react/dist/index.mjs";
import path from "path";
import Inspector from "file:///D:/UKC.world/node_modules/vite-plugin-react-inspector/dist/index.mjs";
var __vite_injected_original_dirname = "D:\\UKC.world";
var devPort = Number(process.env.VITE_DEV_PORT || process.env.PORT || 3e3);
var runtimeNodeEnv = process.env.VITEST ? "test" : process.env.NODE_ENV || "production";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    Inspector({ enabled: process.env.NODE_ENV !== "production" })
  ],
  base: "/",
  define: {
    // Prevent service worker registration in development
    __SW_ENABLED__: false,
    // Ensure React is properly defined in production
    "process.env.NODE_ENV": JSON.stringify(runtimeNodeEnv)
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    // Disable sourcemaps in production for smaller builds
    target: "es2015",
    // Better browser compatibility
    minify: "terser",
    chunkSizeWarningLimit: 1800,
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Optimize asset handling
    assetsInlineLimit: 4096,
    // Files smaller than 4kb will be inlined
    rollupOptions: {
      output: {
        // Let Rollup handle chunking automatically to preserve correct
        // module execution order.  Manual vendor splitting caused
        // runtime errors (React undefined in antd / rc-* chunks).
        chunkFileNames: () => {
          return `assets/js/[name]-[hash].js`;
        },
        entryFileNames: "assets/js/[name]-[hash].js",
        assetFileNames: "assets/[ext]/[name]-[hash].[ext]"
      }
    },
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "src"),
      "src": path.resolve(__vite_injected_original_dirname, "src")
    }
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.BACKEND_API_URL || "http://localhost:4000",
        changeOrigin: true,
        secure: false
      },
      "/uploads": {
        target: process.env.BACKEND_API_URL || "http://localhost:4000",
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
      "Service-Worker-Allowed": "none"
    },
    middlewareMode: false,
    // Intercept service worker requests
    middleware: [
      (req, res, next) => {
        if (req.url && (req.url.includes("sw.js") || req.url.includes("service-worker"))) {
          res.status(404).end("Service Worker disabled in development");
          return;
        }
        next();
      }
    ]
  },
  preview: {
    port: process.env.FRONTEND_PREVIEW_PORT || 2999,
    strictPort: true,
    host: true
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    css: true,
    coverage: {
      reporter: ["text", "html", "clover", "json"]
    }
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react-router-dom",
      "antd",
      "@ant-design/icons",
      "axios"
    ],
    exclude: ["@vite/client", "@vite/env"],
    // Force bundling React context dependencies together
    force: true
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxVS0Mud29ybGRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXFVLQy53b3JsZFxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRDovVUtDLndvcmxkL3ZpdGUuY29uZmlnLmpzXCI7Ly8gdml0ZS5jb25maWcuanNcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnXG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnXG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJ1xuaW1wb3J0IEluc3BlY3RvciBmcm9tICd2aXRlLXBsdWdpbi1yZWFjdC1pbnNwZWN0b3InXG5cbmNvbnN0IGRldlBvcnQgPSBOdW1iZXIocHJvY2Vzcy5lbnYuVklURV9ERVZfUE9SVCB8fCBwcm9jZXNzLmVudi5QT1JUIHx8IDMwMDApO1xuY29uc3QgcnVudGltZU5vZGVFbnYgPSBwcm9jZXNzLmVudi5WSVRFU1QgPyAndGVzdCcgOiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgfHwgJ3Byb2R1Y3Rpb24nKTtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgSW5zcGVjdG9yKHsgZW5hYmxlZDogcHJvY2Vzcy5lbnYuTk9ERV9FTlYgIT09ICdwcm9kdWN0aW9uJyB9KSxcbiAgXSxcbiAgYmFzZTogJy8nLFxuICBkZWZpbmU6IHtcbiAgICAvLyBQcmV2ZW50IHNlcnZpY2Ugd29ya2VyIHJlZ2lzdHJhdGlvbiBpbiBkZXZlbG9wbWVudFxuICAgIF9fU1dfRU5BQkxFRF9fOiBmYWxzZSxcbiAgICAvLyBFbnN1cmUgUmVhY3QgaXMgcHJvcGVybHkgZGVmaW5lZCBpbiBwcm9kdWN0aW9uXG4gICAgJ3Byb2Nlc3MuZW52Lk5PREVfRU5WJzogSlNPTi5zdHJpbmdpZnkocnVudGltZU5vZGVFbnYpXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgb3V0RGlyOiAnZGlzdCcsXG4gICAgYXNzZXRzRGlyOiAnYXNzZXRzJyxcbiAgICBzb3VyY2VtYXA6IGZhbHNlLCAvLyBEaXNhYmxlIHNvdXJjZW1hcHMgaW4gcHJvZHVjdGlvbiBmb3Igc21hbGxlciBidWlsZHNcbiAgICB0YXJnZXQ6ICdlczIwMTUnLCAvLyBCZXR0ZXIgYnJvd3NlciBjb21wYXRpYmlsaXR5XG4gICAgbWluaWZ5OiAndGVyc2VyJyxcbiAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDE4MDAsXG4gICAgXG4gICAgLy8gRW5hYmxlIENTUyBjb2RlIHNwbGl0dGluZ1xuICAgIGNzc0NvZGVTcGxpdDogdHJ1ZSxcbiAgICBcbiAgICAvLyBPcHRpbWl6ZSBhc3NldCBoYW5kbGluZ1xuICAgIGFzc2V0c0lubGluZUxpbWl0OiA0MDk2LCAvLyBGaWxlcyBzbWFsbGVyIHRoYW4gNGtiIHdpbGwgYmUgaW5saW5lZFxuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIG91dHB1dDoge1xuICAgICAgICAvLyBMZXQgUm9sbHVwIGhhbmRsZSBjaHVua2luZyBhdXRvbWF0aWNhbGx5IHRvIHByZXNlcnZlIGNvcnJlY3RcbiAgICAgICAgLy8gbW9kdWxlIGV4ZWN1dGlvbiBvcmRlci4gIE1hbnVhbCB2ZW5kb3Igc3BsaXR0aW5nIGNhdXNlZFxuICAgICAgICAvLyBydW50aW1lIGVycm9ycyAoUmVhY3QgdW5kZWZpbmVkIGluIGFudGQgLyByYy0qIGNodW5rcykuXG4gICAgICAgIGNodW5rRmlsZU5hbWVzOiAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGBhc3NldHMvanMvW25hbWVdLVtoYXNoXS5qc2A7XG4gICAgICAgIH0sXG4gICAgICAgIGVudHJ5RmlsZU5hbWVzOiAnYXNzZXRzL2pzL1tuYW1lXS1baGFzaF0uanMnLFxuICAgICAgICBhc3NldEZpbGVOYW1lczogJ2Fzc2V0cy9bZXh0XS9bbmFtZV0tW2hhc2hdLltleHRdJ1xuICAgICAgfVxuICAgIH0sXG4gICAgdGVyc2VyT3B0aW9uczoge1xuICAgICAgY29tcHJlc3M6IHtcbiAgICAgICAgZHJvcF9jb25zb2xlOiB0cnVlLFxuICAgICAgICBkcm9wX2RlYnVnZ2VyOiB0cnVlXG4gICAgICB9XG4gICAgfVxuICB9LCAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICAnQCc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICdzcmMnKSxcbiAgICAgICdzcmMnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnc3JjJylcbiAgICB9XG4gIH0sXG4gXG4gIHNlcnZlcjoge1xuICAgIHByb3h5OiB7XG4gICAgICAnL2FwaSc6IHtcbiAgICAgICAgdGFyZ2V0OiBwcm9jZXNzLmVudi5CQUNLRU5EX0FQSV9VUkwgfHwgJ2h0dHA6Ly9sb2NhbGhvc3Q6NDAwMCcsXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgc2VjdXJlOiBmYWxzZVxuICAgICAgfSxcbiAgICAgICcvdXBsb2Fkcyc6IHtcbiAgICAgICAgdGFyZ2V0OiBwcm9jZXNzLmVudi5CQUNLRU5EX0FQSV9VUkwgfHwgJ2h0dHA6Ly9sb2NhbGhvc3Q6NDAwMCcsXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgc2VjdXJlOiBmYWxzZVxuICAgICAgfVxuICAgIH0sXG4gIHBvcnQ6IGRldlBvcnQsXG4gIHN0cmljdFBvcnQ6IGZhbHNlLFxuICAgIGhvc3Q6IHRydWUsXG4gICAgLy8gRGlzYWJsZSBzZXJ2aWNlIHdvcmtlciBpbiBkZXZlbG9wbWVudFxuICAgIGNvcnM6IHRydWUsXG4gICAgaGVhZGVyczoge1xuICAgICAgJ1NlcnZpY2UtV29ya2VyLUFsbG93ZWQnOiAnbm9uZSdcbiAgICB9LFxuICAgIG1pZGRsZXdhcmVNb2RlOiBmYWxzZSxcbiAgICAvLyBJbnRlcmNlcHQgc2VydmljZSB3b3JrZXIgcmVxdWVzdHNcbiAgICBtaWRkbGV3YXJlOiBbXG4gICAgICAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgICAgICAgaWYgKHJlcS51cmwgJiYgKHJlcS51cmwuaW5jbHVkZXMoJ3N3LmpzJykgfHwgcmVxLnVybC5pbmNsdWRlcygnc2VydmljZS13b3JrZXInKSkpIHtcbiAgICAgICAgICByZXMuc3RhdHVzKDQwNCkuZW5kKCdTZXJ2aWNlIFdvcmtlciBkaXNhYmxlZCBpbiBkZXZlbG9wbWVudCcpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBuZXh0KCk7XG4gICAgICB9XG4gICAgXVxuICB9LCAgcHJldmlldzoge1xuICAgIHBvcnQ6IHByb2Nlc3MuZW52LkZST05URU5EX1BSRVZJRVdfUE9SVCB8fCAyOTk5LFxuICAgIHN0cmljdFBvcnQ6IHRydWUsXG4gICAgaG9zdDogdHJ1ZVxuICB9LFxuICB0ZXN0OiB7XG4gICAgZ2xvYmFsczogdHJ1ZSxcbiAgICBlbnZpcm9ubWVudDogJ2pzZG9tJyxcbiAgICBzZXR1cEZpbGVzOiAnLi9zcmMvdGVzdC9zZXR1cC5qcycsXG4gICAgY3NzOiB0cnVlLFxuICAgIGNvdmVyYWdlOiB7XG4gICAgICByZXBvcnRlcjogWyd0ZXh0JywgJ2h0bWwnLCAnY2xvdmVyJywgJ2pzb24nXVxuICAgIH1cbiAgfSxcbiAgLy8gT3B0aW1pemUgZGVwZW5kZW5jaWVzXG4gIG9wdGltaXplRGVwczoge1xuICAgIGluY2x1ZGU6IFtcbiAgICAgICdyZWFjdCcsXG4gICAgICAncmVhY3QtZG9tJyxcbiAgICAgICdyZWFjdC1kb20vY2xpZW50JyxcbiAgICAgICdyZWFjdC1yb3V0ZXItZG9tJywgXG4gICAgICAnYW50ZCcsXG4gICAgICAnQGFudC1kZXNpZ24vaWNvbnMnLFxuICAgICAgJ2F4aW9zJyxcbiAgICBdLFxuICAgIGV4Y2x1ZGU6IFsnQHZpdGUvY2xpZW50JywgJ0B2aXRlL2VudiddLFxuICAgIC8vIEZvcmNlIGJ1bmRsaW5nIFJlYWN0IGNvbnRleHQgZGVwZW5kZW5jaWVzIHRvZ2V0aGVyXG4gICAgZm9yY2U6IHRydWVcbiAgfSxcbn0pIl0sCiAgIm1hcHBpbmdzIjogIjtBQUNBLFNBQVMsb0JBQW9CO0FBQzdCLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsT0FBTyxlQUFlO0FBSnRCLElBQU0sbUNBQW1DO0FBTXpDLElBQU0sVUFBVSxPQUFPLFFBQVEsSUFBSSxpQkFBaUIsUUFBUSxJQUFJLFFBQVEsR0FBSTtBQUM1RSxJQUFNLGlCQUFpQixRQUFRLElBQUksU0FBUyxTQUFVLFFBQVEsSUFBSSxZQUFZO0FBRTlFLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLFVBQVUsRUFBRSxTQUFTLFFBQVEsSUFBSSxhQUFhLGFBQWEsQ0FBQztBQUFBLEVBQzlEO0FBQUEsRUFDQSxNQUFNO0FBQUEsRUFDTixRQUFRO0FBQUE7QUFBQSxJQUVOLGdCQUFnQjtBQUFBO0FBQUEsSUFFaEIsd0JBQXdCLEtBQUssVUFBVSxjQUFjO0FBQUEsRUFDdkQ7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxJQUNSLFdBQVc7QUFBQSxJQUNYLFdBQVc7QUFBQTtBQUFBLElBQ1gsUUFBUTtBQUFBO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUix1QkFBdUI7QUFBQTtBQUFBLElBR3ZCLGNBQWM7QUFBQTtBQUFBLElBR2QsbUJBQW1CO0FBQUE7QUFBQSxJQUNuQixlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUE7QUFBQTtBQUFBO0FBQUEsUUFJTixnQkFBZ0IsTUFBTTtBQUNwQixpQkFBTztBQUFBLFFBQ1Q7QUFBQSxRQUNBLGdCQUFnQjtBQUFBLFFBQ2hCLGdCQUFnQjtBQUFBLE1BQ2xCO0FBQUEsSUFDRjtBQUFBLElBQ0EsZUFBZTtBQUFBLE1BQ2IsVUFBVTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsZUFBZTtBQUFBLE1BQ2pCO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUFJLFNBQVM7QUFBQSxJQUNYLE9BQU87QUFBQSxNQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLEtBQUs7QUFBQSxNQUNsQyxPQUFPLEtBQUssUUFBUSxrQ0FBVyxLQUFLO0FBQUEsSUFDdEM7QUFBQSxFQUNGO0FBQUEsRUFFQSxRQUFRO0FBQUEsSUFDTixPQUFPO0FBQUEsTUFDTCxRQUFRO0FBQUEsUUFDTixRQUFRLFFBQVEsSUFBSSxtQkFBbUI7QUFBQSxRQUN2QyxjQUFjO0FBQUEsUUFDZCxRQUFRO0FBQUEsTUFDVjtBQUFBLE1BQ0EsWUFBWTtBQUFBLFFBQ1YsUUFBUSxRQUFRLElBQUksbUJBQW1CO0FBQUEsUUFDdkMsY0FBYztBQUFBLFFBQ2QsUUFBUTtBQUFBLE1BQ1Y7QUFBQSxJQUNGO0FBQUEsSUFDRixNQUFNO0FBQUEsSUFDTixZQUFZO0FBQUEsSUFDVixNQUFNO0FBQUE7QUFBQSxJQUVOLE1BQU07QUFBQSxJQUNOLFNBQVM7QUFBQSxNQUNQLDBCQUEwQjtBQUFBLElBQzVCO0FBQUEsSUFDQSxnQkFBZ0I7QUFBQTtBQUFBLElBRWhCLFlBQVk7QUFBQSxNQUNWLENBQUMsS0FBSyxLQUFLLFNBQVM7QUFDbEIsWUFBSSxJQUFJLFFBQVEsSUFBSSxJQUFJLFNBQVMsT0FBTyxLQUFLLElBQUksSUFBSSxTQUFTLGdCQUFnQixJQUFJO0FBQ2hGLGNBQUksT0FBTyxHQUFHLEVBQUUsSUFBSSx3Q0FBd0M7QUFDNUQ7QUFBQSxRQUNGO0FBQ0EsYUFBSztBQUFBLE1BQ1A7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQUksU0FBUztBQUFBLElBQ1gsTUFBTSxRQUFRLElBQUkseUJBQXlCO0FBQUEsSUFDM0MsWUFBWTtBQUFBLElBQ1osTUFBTTtBQUFBLEVBQ1I7QUFBQSxFQUNBLE1BQU07QUFBQSxJQUNKLFNBQVM7QUFBQSxJQUNULGFBQWE7QUFBQSxJQUNiLFlBQVk7QUFBQSxJQUNaLEtBQUs7QUFBQSxJQUNMLFVBQVU7QUFBQSxNQUNSLFVBQVUsQ0FBQyxRQUFRLFFBQVEsVUFBVSxNQUFNO0FBQUEsSUFDN0M7QUFBQSxFQUNGO0FBQUE7QUFBQSxFQUVBLGNBQWM7QUFBQSxJQUNaLFNBQVM7QUFBQSxNQUNQO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUFBLElBQ0EsU0FBUyxDQUFDLGdCQUFnQixXQUFXO0FBQUE7QUFBQSxJQUVyQyxPQUFPO0FBQUEsRUFDVDtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
