import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: [
      'src/**/*.{test,spec}.{js,jsx,ts,tsx}',
      // Exclude backend tests - they use Jest
      // 'backend/**/*.{test,spec}.{js,mjs}',
      'tests/security/**/*.test.js',
      'tests/integration/**/*.test.js'
    ],
    exclude: [
      'node_modules',
      'dist',
      'build',
      '.next',
      'coverage',
      'tests/e2e/**/*', // Exclude Playwright E2E tests
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'tests/e2e',
        'src/test',
        '**/*.config.js',
        '**/*.config.ts',
        '**/dist/**'
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/Images': path.resolve(__dirname, './Images')
    }
  }
});
