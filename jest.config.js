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
    'src/routes/payments.routes.js': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    'src/routes/orders.routes.js': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    'src/routes/webhooks.routes.js': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    'src/middlewares/webhookStrictDependencyGuard.js': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    'src/lib/critical-dependencies.js': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    'src/utils/minor-units.js': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    'src/lib/webhook-idempotency-store.js': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
};