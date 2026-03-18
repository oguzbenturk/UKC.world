/** @type {import('jest').Config} */
export default {
  roots: ['../tests/unit/backend'],
  testEnvironment: 'node',
  transform: {},
  setupFiles: ['../tests/setup/jest.setup.js'],
};
