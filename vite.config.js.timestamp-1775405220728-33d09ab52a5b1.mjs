// vite.config.js
import { defineConfig } from "file:///D:/UKC.world/node_modules/vite/dist/node/index.js";
import react from "file:///D:/UKC.world/node_modules/@vitejs/plugin-react/dist/index.mjs";
import path from "path";
var __vite_injected_original_dirname = "D:\\UKC.world";
var devPort = Number(process.env.VITE_DEV_PORT || process.env.PORT || 3e3);
var runtimeNodeEnv = process.env.VITEST ? "test" : process.env.NODE_ENV || "production";
var vite_config_default = defineConfig({
  plugins: [react()],
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxVS0Mud29ybGRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXFVLQy53b3JsZFxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRDovVUtDLndvcmxkL3ZpdGUuY29uZmlnLmpzXCI7Ly8gdml0ZS5jb25maWcuanNcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnXG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnXG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJ1xuXG5jb25zdCBkZXZQb3J0ID0gTnVtYmVyKHByb2Nlc3MuZW52LlZJVEVfREVWX1BPUlQgfHwgcHJvY2Vzcy5lbnYuUE9SVCB8fCAzMDAwKTtcbmNvbnN0IHJ1bnRpbWVOb2RlRW52ID0gcHJvY2Vzcy5lbnYuVklURVNUID8gJ3Rlc3QnIDogKHByb2Nlc3MuZW52Lk5PREVfRU5WIHx8ICdwcm9kdWN0aW9uJyk7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtyZWFjdCgpXSwgIFxuICBiYXNlOiAnLycsXG4gIGRlZmluZToge1xuICAgIC8vIFByZXZlbnQgc2VydmljZSB3b3JrZXIgcmVnaXN0cmF0aW9uIGluIGRldmVsb3BtZW50XG4gICAgX19TV19FTkFCTEVEX186IGZhbHNlLFxuICAgIC8vIEVuc3VyZSBSZWFjdCBpcyBwcm9wZXJseSBkZWZpbmVkIGluIHByb2R1Y3Rpb25cbiAgICAncHJvY2Vzcy5lbnYuTk9ERV9FTlYnOiBKU09OLnN0cmluZ2lmeShydW50aW1lTm9kZUVudilcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICBvdXREaXI6ICdkaXN0JyxcbiAgICBhc3NldHNEaXI6ICdhc3NldHMnLFxuICAgIHNvdXJjZW1hcDogZmFsc2UsIC8vIERpc2FibGUgc291cmNlbWFwcyBpbiBwcm9kdWN0aW9uIGZvciBzbWFsbGVyIGJ1aWxkc1xuICAgIHRhcmdldDogJ2VzMjAxNScsIC8vIEJldHRlciBicm93c2VyIGNvbXBhdGliaWxpdHlcbiAgICBtaW5pZnk6ICd0ZXJzZXInLFxuICAgIGNodW5rU2l6ZVdhcm5pbmdMaW1pdDogMTgwMCxcbiAgICBcbiAgICAvLyBFbmFibGUgQ1NTIGNvZGUgc3BsaXR0aW5nXG4gICAgY3NzQ29kZVNwbGl0OiB0cnVlLFxuICAgIFxuICAgIC8vIE9wdGltaXplIGFzc2V0IGhhbmRsaW5nXG4gICAgYXNzZXRzSW5saW5lTGltaXQ6IDQwOTYsIC8vIEZpbGVzIHNtYWxsZXIgdGhhbiA0a2Igd2lsbCBiZSBpbmxpbmVkXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIC8vIExldCBSb2xsdXAgaGFuZGxlIGNodW5raW5nIGF1dG9tYXRpY2FsbHkgdG8gcHJlc2VydmUgY29ycmVjdFxuICAgICAgICAvLyBtb2R1bGUgZXhlY3V0aW9uIG9yZGVyLiAgTWFudWFsIHZlbmRvciBzcGxpdHRpbmcgY2F1c2VkXG4gICAgICAgIC8vIHJ1bnRpbWUgZXJyb3JzIChSZWFjdCB1bmRlZmluZWQgaW4gYW50ZCAvIHJjLSogY2h1bmtzKS5cbiAgICAgICAgY2h1bmtGaWxlTmFtZXM6ICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gYGFzc2V0cy9qcy9bbmFtZV0tW2hhc2hdLmpzYDtcbiAgICAgICAgfSxcbiAgICAgICAgZW50cnlGaWxlTmFtZXM6ICdhc3NldHMvanMvW25hbWVdLVtoYXNoXS5qcycsXG4gICAgICAgIGFzc2V0RmlsZU5hbWVzOiAnYXNzZXRzL1tleHRdL1tuYW1lXS1baGFzaF0uW2V4dF0nXG4gICAgICB9XG4gICAgfSxcbiAgICB0ZXJzZXJPcHRpb25zOiB7XG4gICAgICBjb21wcmVzczoge1xuICAgICAgICBkcm9wX2NvbnNvbGU6IHRydWUsXG4gICAgICAgIGRyb3BfZGVidWdnZXI6IHRydWVcbiAgICAgIH1cbiAgICB9XG4gIH0sICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJ3NyYycpLFxuICAgICAgJ3NyYyc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICdzcmMnKVxuICAgIH1cbiAgfSxcbiBcbiAgc2VydmVyOiB7XG4gICAgcHJveHk6IHtcbiAgICAgICcvYXBpJzoge1xuICAgICAgICB0YXJnZXQ6IHByb2Nlc3MuZW52LkJBQ0tFTkRfQVBJX1VSTCB8fCAnaHR0cDovL2xvY2FsaG9zdDo0MDAwJyxcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICBzZWN1cmU6IGZhbHNlXG4gICAgICB9LFxuICAgICAgJy91cGxvYWRzJzoge1xuICAgICAgICB0YXJnZXQ6IHByb2Nlc3MuZW52LkJBQ0tFTkRfQVBJX1VSTCB8fCAnaHR0cDovL2xvY2FsaG9zdDo0MDAwJyxcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICBzZWN1cmU6IGZhbHNlXG4gICAgICB9XG4gICAgfSxcbiAgcG9ydDogZGV2UG9ydCxcbiAgc3RyaWN0UG9ydDogZmFsc2UsXG4gICAgaG9zdDogdHJ1ZSxcbiAgICAvLyBEaXNhYmxlIHNlcnZpY2Ugd29ya2VyIGluIGRldmVsb3BtZW50XG4gICAgY29yczogdHJ1ZSxcbiAgICBoZWFkZXJzOiB7XG4gICAgICAnU2VydmljZS1Xb3JrZXItQWxsb3dlZCc6ICdub25lJ1xuICAgIH0sXG4gICAgbWlkZGxld2FyZU1vZGU6IGZhbHNlLFxuICAgIC8vIEludGVyY2VwdCBzZXJ2aWNlIHdvcmtlciByZXF1ZXN0c1xuICAgIG1pZGRsZXdhcmU6IFtcbiAgICAgIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICAgICAgICBpZiAocmVxLnVybCAmJiAocmVxLnVybC5pbmNsdWRlcygnc3cuanMnKSB8fCByZXEudXJsLmluY2x1ZGVzKCdzZXJ2aWNlLXdvcmtlcicpKSkge1xuICAgICAgICAgIHJlcy5zdGF0dXMoNDA0KS5lbmQoJ1NlcnZpY2UgV29ya2VyIGRpc2FibGVkIGluIGRldmVsb3BtZW50Jyk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIG5leHQoKTtcbiAgICAgIH1cbiAgICBdXG4gIH0sICBwcmV2aWV3OiB7XG4gICAgcG9ydDogcHJvY2Vzcy5lbnYuRlJPTlRFTkRfUFJFVklFV19QT1JUIHx8IDI5OTksXG4gICAgc3RyaWN0UG9ydDogdHJ1ZSxcbiAgICBob3N0OiB0cnVlXG4gIH0sXG4gIHRlc3Q6IHtcbiAgICBnbG9iYWxzOiB0cnVlLFxuICAgIGVudmlyb25tZW50OiAnanNkb20nLFxuICAgIHNldHVwRmlsZXM6ICcuL3NyYy90ZXN0L3NldHVwLmpzJyxcbiAgICBjc3M6IHRydWUsXG4gICAgY292ZXJhZ2U6IHtcbiAgICAgIHJlcG9ydGVyOiBbJ3RleHQnLCAnaHRtbCcsICdjbG92ZXInLCAnanNvbiddXG4gICAgfVxuICB9LFxuICAvLyBPcHRpbWl6ZSBkZXBlbmRlbmNpZXNcbiAgb3B0aW1pemVEZXBzOiB7XG4gICAgaW5jbHVkZTogW1xuICAgICAgJ3JlYWN0JyxcbiAgICAgICdyZWFjdC1kb20nLFxuICAgICAgJ3JlYWN0LWRvbS9jbGllbnQnLFxuICAgICAgJ3JlYWN0LXJvdXRlci1kb20nLCBcbiAgICAgICdhbnRkJyxcbiAgICAgICdAYW50LWRlc2lnbi9pY29ucycsXG4gICAgICAnYXhpb3MnLFxuICAgIF0sXG4gICAgZXhjbHVkZTogWydAdml0ZS9jbGllbnQnLCAnQHZpdGUvZW52J10sXG4gICAgLy8gRm9yY2UgYnVuZGxpbmcgUmVhY3QgY29udGV4dCBkZXBlbmRlbmNpZXMgdG9nZXRoZXJcbiAgICBmb3JjZTogdHJ1ZVxuICB9LFxufSkiXSwKICAibWFwcGluZ3MiOiAi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
