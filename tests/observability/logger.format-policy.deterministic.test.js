import { jest } from '@jest/globals';

const FIXED_ISO = '2025-01-02T03:04:05.000Z';
const FIXED_DATE = new Date(FIXED_ISO);

describe('logger format policy invariants (deterministic)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_DATE);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('development pretty mode is single-line, redacted, and preserves correlationId', async () => {
    process.env.NODE_ENV = 'development';
    process.env.LOG_FORMAT = 'pretty';

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { logger } = await import('../../src/utils/logger.js');

    logger.info('observability_pretty_policy_test', {
      correlationId: 'corr-fixed-123',
      authorization: 'Bearer super-secret-token',
      cookie: 'refreshToken=raw-refresh-secret',
      'stripe-signature': 'whsec_raw_signature',
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [line] = logSpy.mock.calls[0];

    expect(line).toContain(FIXED_ISO);
    expect(line).toContain('INFO');
    expect(line).toContain('observability_pretty_policy_test');
    expect(line).toContain('corr-fixed-123');

    expect(line).not.toContain('\n');
    expect(line).not.toContain('\r');

    expect(line).not.toContain('super-secret-token');
    expect(line).not.toContain('refreshToken=raw-refresh-secret');
    expect(line).not.toContain('whsec_raw_signature');
    expect(line).toContain('[REDACTED]');

    expect(line).not.toContain('"headers"');
    expect(line).not.toContain('"user-agent"');
  });

  test('production forces JSON output even when LOG_FORMAT=pretty', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_FORMAT = 'pretty';

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { logger } = await import('../../src/utils/logger.js');

    logger.info('observability_json_forced_in_production', {
      correlationId: 'corr-prod-456',
      authorization: 'Bearer prod-secret',
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [line] = logSpy.mock.calls[0];

    expect(() => JSON.parse(line)).not.toThrow();
    const parsed = JSON.parse(line);

    expect(parsed).toEqual(
      expect.objectContaining({
        timestamp: FIXED_ISO,
        level: 'info',
        event: 'observability_json_forced_in_production',
        correlationId: 'corr-prod-456',
      }),
    );

    expect(parsed.authorization).toBe('[REDACTED]');
    expect(line).not.toContain('prod-secret');
  });
});