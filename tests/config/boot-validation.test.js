import { jest } from '@jest/globals';
import { assertProductionBootConfigOrExit, validateBootConfig } from '../../src/config/boot-validation.js';
import { logger } from '../../src/utils/logger.js';

describe('boot configuration validation', () => {
  test('validateBootConfig reports missing required production settings', () => {
    const result = validateBootConfig({
      NODE_ENV: 'production',
      PAYMENTS_ENABLED: 'true',
      PAYPAL_ENABLED: 'true',
      CORS_ORIGIN: '*',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'JWT_ACCESS_SECRET is required',
      'JWT_REFRESH_SECRET is required',
      'JWT_ACCESS_ISSUER is required',
      'JWT_ACCESS_AUDIENCE is required',
      'JWT_ACCESS_EXPIRY is required',
      'JWT_REFRESH_ISSUER is required',
      'JWT_REFRESH_AUDIENCE is required',
      'JWT_REFRESH_EXPIRY is required',
      'STRIPE_SECRET is required when PAYMENTS_ENABLED=true',
      'STRIPE_WEBHOOK_SECRET is required',
      'PAYPAL_CLIENT_SECRET is required when PAYPAL_ENABLED=true',
      'CORS_ORIGIN contains an invalid origin: *',
    ]));
  });

  test('validateBootConfig enforces minimum JWT secret length', () => {
    const result = validateBootConfig({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'short-secret',
      JWT_ACCESS_ISSUER: 'issuer-a',
      JWT_ACCESS_AUDIENCE: 'aud-a',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_SECRET: 'short-refresh-secret',
      JWT_REFRESH_ISSUER: 'issuer-r',
      JWT_REFRESH_AUDIENCE: 'aud-r',
      JWT_REFRESH_EXPIRY: '30m',
      STRIPE_WEBHOOK_SECRET: 'whsec_x',
      CORS_ORIGIN: 'https://app.example.com',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'JWT_ACCESS_SECRET must be at least 32 characters',
      'JWT_REFRESH_SECRET must be at least 32 characters',
    ]));
  });

  test('assertProductionBootConfigOrExit fails fast in production', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    assertProductionBootConfigOrExit({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: '',
      JWT_ACCESS_ISSUER: 'insidex-auth',
      JWT_ACCESS_AUDIENCE: 'insidex-api',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_SECRET: '',
      JWT_REFRESH_ISSUER: 'insidex-auth-refresh',
      JWT_REFRESH_AUDIENCE: 'insidex-api-refresh',
      JWT_REFRESH_EXPIRY: '30m',
      CORS_ORIGIN: 'https://app.example.com',
    });

    expect(loggerSpy).toHaveBeenCalledWith('boot_config_invalid', expect.objectContaining({
      errors: expect.arrayContaining(['JWT_ACCESS_SECRET is required', 'JWT_REFRESH_SECRET is required', 'STRIPE_WEBHOOK_SECRET is required']),
    }));
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    loggerSpy.mockRestore();
  });

  test('assertProductionBootConfigOrExit exits when JWT_ACCESS_SECRET is missing in production', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);

    assertProductionBootConfigOrExit({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: '',
      JWT_ACCESS_ISSUER: 'insidex-auth',
      JWT_ACCESS_AUDIENCE: 'insidex-api',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-1234567890a',
      JWT_REFRESH_ISSUER: 'insidex-auth-refresh',
      JWT_REFRESH_AUDIENCE: 'insidex-api-refresh',
      JWT_REFRESH_EXPIRY: '30m',
      STRIPE_WEBHOOK_SECRET: 'whsec_123',
      CORS_ORIGIN: 'https://app.example.com',
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  test('assertProductionBootConfigOrExit exits when JWT_REFRESH_SECRET is missing in production', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);

    assertProductionBootConfigOrExit({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'test-jwt-access-secret-1234567890ab',
      JWT_ACCESS_ISSUER: 'insidex-auth',
      JWT_ACCESS_AUDIENCE: 'insidex-api',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_SECRET: '',
      JWT_REFRESH_ISSUER: 'insidex-auth-refresh',
      JWT_REFRESH_AUDIENCE: 'insidex-api-refresh',
      JWT_REFRESH_EXPIRY: '30m',
      STRIPE_WEBHOOK_SECRET: 'whsec_123',
      CORS_ORIGIN: 'https://app.example.com',
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
  
  test('assertProductionBootConfigOrExit does not exit outside production', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);

    assertProductionBootConfigOrExit({
      NODE_ENV: 'test',
    });

    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});