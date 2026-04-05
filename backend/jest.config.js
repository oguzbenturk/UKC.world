/** @type {import('jest').Config} */
export default {
  roots: ['../tests/unit/backend'],
  testEnvironment: 'node',
  transform: {},
  setupFiles: ['../tests/setup/jest.setup.js'],
  testMatch: ['**/*.test.js'],
  moduleDirectories: ['node_modules', '../../../backend/node_modules'],
};
