import { jest } from '@jest/globals';

describe('boot validation payments gating', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  function baseProductionEnv() {
    return {
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'test-jwt-access-secret-1234567890abcdef',
      JWT_ACCESS_ISSUER: 'insidex-auth',
      JWT_ACCESS_AUDIENCE: 'insidex-api',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-1234567890abcdef',
      JWT_REFRESH_ISSUER: 'insidex-auth-refresh',
      JWT_REFRESH_AUDIENCE: 'insidex-api-refresh',
      JWT_REFRESH_EXPIRY: '30m',
      JWT_SECRET: 'test-jwt-unified-secret-1234567890abcdef',
      REDIS_URL: 'redis://127.0.0.1:6379',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
      CORS_ORIGIN: 'https://app.example.com',
    };
  }

  test('fails fast in production when payments enabled and required provider key is missing', async () => {
    const { assertProductionBootConfigOrExit } = await import('../../src/config/boot-validation.js');
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);

    assertProductionBootConfigOrExit({
      ...baseProductionEnv(),
      PAYMENTS_ENABLED: 'true',
      PAYMENTS_PROVIDER: 'stripe',
      PAYMENT_WEBHOOK_SECRET: 'whsec_123',
      // STRIPE_SECRET intentionally missing
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('does not require provider keys in production when payments are disabled', async () => {
    const { validateBootConfig } = await import('../../src/config/boot-validation.js');

    const result = validateBootConfig({
      ...baseProductionEnv(),
      PAYMENTS_ENABLED: 'false',
    });

    expect(result.valid).toBe(true);
  });

  test('does not hard fail outside production', async () => {
    const { assertProductionBootConfigOrExit } = await import('../../src/config/boot-validation.js');
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);

    assertProductionBootConfigOrExit({
      NODE_ENV: 'test',
      PAYMENTS_ENABLED: 'true',
      PAYMENTS_PROVIDER: 'both',
    });

    expect(exitSpy).not.toHaveBeenCalled();
  });
});