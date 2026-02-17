export default {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/routes/**/*.js',
    'src/repositories/**/*.js',
    'src/middlewares/**/*.js',
    '!src/middlewares/error-handler.js',
    'src/lib/**/*.js',
    '!src/lib/prisma.js',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 90,
      functions: 100,
      lines: 95,
    },
  },
};