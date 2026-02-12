export default {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/validation/**/*.js',
    'src/errors/validation-error.js',
    'src/middlewares/error-handler.js'
  ],
  coverageThreshold: {
    './src/validation/': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};