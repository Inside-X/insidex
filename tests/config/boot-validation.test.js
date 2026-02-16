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
      'JWT_SECRET is required',
      'STRIPE_SECRET is required when PAYMENTS_ENABLED=true',
      'STRIPE_WEBHOOK_SECRET is required',
      'PAYPAL_CLIENT_SECRET is required when PAYPAL_ENABLED=true',
      'CORS_ORIGIN contains an invalid origin: *',
    ]));
  });

  test('assertProductionBootConfigOrExit fails fast in production', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    assertProductionBootConfigOrExit({
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://app.example.com',
    });

    expect(loggerSpy).toHaveBeenCalledWith('boot_config_invalid', expect.objectContaining({
      errors: expect.arrayContaining(['JWT_SECRET is required', 'STRIPE_WEBHOOK_SECRET is required']),
    }));
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    loggerSpy.mockRestore();
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