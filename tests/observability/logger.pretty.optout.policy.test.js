import { jest } from '@jest/globals';

describe('logger pretty opt-out policy', () => {
  let logSpy;
  const originalLogFormat = process.env.LOG_FORMAT;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    delete process.env.LOG_FORMAT;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    logSpy.mockRestore();

    if (originalLogFormat === undefined) delete process.env.LOG_FORMAT;
    else process.env.LOG_FORMAT = originalLogFormat;

    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  test('non-production LOG_FORMAT=pretty remains single-line, preserves correlationId, and redacts secrets', async () => {
    process.env.LOG_FORMAT = 'pretty';
    process.env.NODE_ENV = 'test';

    jest.resetModules();
    const { logger } = await import('../../src/utils/logger.js');

    logger.info('pretty_policy_event', {
      correlationId: 'corr-pretty-1',
      authorization: 'Bearer SECRET_TOKEN_123',
      cookie: 'refreshToken=SECRET_REFRESH_456',
      stripeSignature: 't=1,v1=SECRET_SIG_789',
      note: 'safe',
    });
    logger.info('pretty_nometa_event');

    expect(logSpy).toHaveBeenCalledTimes(2);
    const line = String(logSpy.mock.calls[0][0]);
    const noMetaLine = String(logSpy.mock.calls[1][0]);

    expect(line).toContain('corr-pretty-1');
    expect(line).toContain('[REDACTED]');
    expect(line).not.toContain('SECRET_TOKEN_123');
    expect(line).not.toContain('SECRET_REFRESH_456');
    expect(line).not.toContain('SECRET_SIG_789');
    expect(line).not.toMatch(/[\r\n]/);
    expect(noMetaLine).toContain('pretty_nometa_event');
    expect(noMetaLine).not.toMatch(/[\r\n]/);
    expect(() => JSON.parse(line)).toThrow();
  });

  test('production ignores LOG_FORMAT=pretty and still emits parseable JSON line', async () => {
    process.env.LOG_FORMAT = 'pretty';
    process.env.NODE_ENV = 'production';

    jest.resetModules();
    const { logger } = await import('../../src/utils/logger.js');

    logger.info('prod_policy_event', { correlationId: 'corr-prod-1', key: 'value' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = String(logSpy.mock.calls[0][0]);
    const parsed = JSON.parse(line);

    expect(parsed).toEqual(expect.objectContaining({
      event: 'prod_policy_event',
      level: 'info',
      correlationId: 'corr-prod-1',
      timestamp: expect.any(String),
    }));
  });
});