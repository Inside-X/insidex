import { jest } from '@jest/globals';

async function loadLoggerWithEnv(env = {}) {
  const originalLogLevel = process.env.LOG_LEVEL;
  const originalNodeEnv = process.env.NODE_ENV;

  if (env.LOG_LEVEL === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = env.LOG_LEVEL;
  }

  if (env.NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = env.NODE_ENV;
  }

  jest.resetModules();
  const mod = await import('../../src/utils/logger.js');

  if (originalLogLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = originalLogLevel;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  return mod.logger;
}

describe('logger JSON line + redaction unit', () => {
  let logSpy;
  let warnSpy;
  let errorSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('emits JSON line with required keys and event name', async () => {
    const logger = await loadLoggerWithEnv({ NODE_ENV: 'test' });
    logger.info('unit_json_event', { correlationId: 'corr-1', value: 10 });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(line);

    expect(parsed).toEqual(expect.objectContaining({
      timestamp: expect.any(String),
      level: 'info',
      event: 'unit_json_event',
      correlationId: 'corr-1',
      value: 10,
    }));
  });

  test('routes warn/error levels to correct console and redacts sensitive keys', async () => {
    const logger = await loadLoggerWithEnv({ NODE_ENV: 'test' });
    logger.warn('warn_event', { authorization: 'Bearer SECRET_TOKEN_123', cookie: 'refreshToken=SECRET_REFRESH_456' });
    logger.error('error_event', { stripeSignature: 't=1,v1=SECRET_SIG_789' });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const warnParsed = JSON.parse(warnSpy.mock.calls[0][0]);
    const errorParsed = JSON.parse(errorSpy.mock.calls[0][0]);

    expect(warnParsed.authorization).toBe('[REDACTED]');
    expect(warnParsed.cookie).toBe('[REDACTED]');
    expect(errorParsed.stripeSignature).toBe('[REDACTED]');
  });

  test('handles Error objects, nested arrays, circular objects, and string secret redaction', async () => {
    const logger = await loadLoggerWithEnv({ NODE_ENV: 'test' });

    const circular = { a: 1 };
    circular.self = circular;
    const err = Object.assign(new Error('boom'), { code: 'EBOOM' });

    logger.info('complex_event', {
      message: 'Bearer SECRET_TOKEN_123',
      errors: [err],
      circular,
    });

    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.message).toBe('[REDACTED]');
    expect(parsed.errors[0]).toEqual(expect.objectContaining({ name: 'Error', message: 'boom', code: 'EBOOM' }));
    expect(parsed.circular.self).toBe('[Circular]');
  });

  test('respects LOG_LEVEL gating and serializes unserializable meta safely', async () => {
    const loggerAtError = await loadLoggerWithEnv({ LOG_LEVEL: 'error', NODE_ENV: 'test' });

    loggerAtError.info('suppressed_info', { ok: true });
    loggerAtError.error('bad_meta_event', { bigint: 10n });

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(parsed).toEqual(expect.objectContaining({ event: 'bad_meta_event', meta: '[unserializable]' }));
  });
});