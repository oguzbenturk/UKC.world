/** @type {import('jest').Config} */
export default {
  roots: ['../tests/unit/backend'],
  testEnvironment: 'node',
  transform: {},
  setupFiles: ['../tests/setup/jest.setup.js'],
  testMatch: ['**/*.test.js'],
  moduleDirectories: ['node_modules', '../../../backend/node_modules'],
  // Route suites import the whole server.js app and hit the real local DB;
  // the first request in a file (cold module graph + pool) can exceed the 5s default.
  testTimeout: 30000,
};
