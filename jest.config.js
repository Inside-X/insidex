export default {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.d.js',
    '!src/validation/schemas/common.schema.js',
    '!src/validation/schemas/index.js',
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      statements: 95,
    },
  },
};