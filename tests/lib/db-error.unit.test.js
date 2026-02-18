import { jest } from '@jest/globals';

async function loadDbErrorModule() {
  jest.resetModules();

  const logger = {
    warn: jest.fn(),
    error: jest.fn(),
  };

  await jest.unstable_mockModule('../../src/utils/logger.js', () => ({ logger }));
  const mod = await import('../../src/lib/db-error.js');
  return { ...mod, logger };
}

describe('normalizeDbError', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('passes through explicit 4xx status errors and logs warn', async () => {
    const { normalizeDbError, logger } = await loadDbErrorModule();
    const err = Object.assign(new Error('bad request'), { statusCode: 400, code: 'X400', meta: { a: 1 } });
    const context = { repository: 'user', operation: 'create' };

    expect(() => normalizeDbError(err, context)).toThrow(err);
    expect(logger.warn).toHaveBeenCalledWith('db_error', {
      message: 'bad request',
      code: 'X400',
      meta: { a: 1 },
      context,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('maps P2002 to DB_UNIQUE_CONSTRAINT with 409', async () => {
    const { normalizeDbError, logger } = await loadDbErrorModule();
    const err = Object.assign(new Error('unique fail'), { code: 'P2002', meta: { target: ['email'] } });

    expect(() => normalizeDbError(err, { op: 'create' })).toThrow('Database unique constraint violation');
    try {
      normalizeDbError(err, { op: 'create' });
    } catch (mapped) {
      expect(mapped.statusCode).toBe(409);
      expect(mapped.code).toBe('DB_UNIQUE_CONSTRAINT');
    }

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.error).not.toHaveBeenCalled();
  });


  test('uses default empty context when omitted', async () => {
    const { normalizeDbError, logger } = await loadDbErrorModule();
    const err = Object.assign(new Error('oops'), { code: 'P2002' });

    expect(() => normalizeDbError(err)).toThrow('Database unique constraint violation');
    expect(logger.warn).toHaveBeenCalledWith('db_error', expect.objectContaining({ context: {} }));
  });

  test('maps P2025 to DB_RECORD_NOT_FOUND with 404', async () => {
    const { normalizeDbError, logger } = await loadDbErrorModule();
    const err = Object.assign(new Error('missing'), { code: 'P2025' });

    expect(() => normalizeDbError(err, { op: 'update' })).toThrow('Database record not found');
    try {
      normalizeDbError(err, { op: 'update' });
    } catch (mapped) {
      expect(mapped.statusCode).toBe(404);
      expect(mapped.code).toBe('DB_RECORD_NOT_FOUND');
    }

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('maps unknown errors to DB_OPERATION_FAILED with 500 and logs error', async () => {
    const { normalizeDbError, logger } = await loadDbErrorModule();
    const err = Object.assign(new Error('boom'), { code: 'UNKNOWN', meta: { source: 'db' } });

    expect(() => normalizeDbError(err, { op: 'list' })).toThrow('Database operation failed');
    try {
      normalizeDbError(err, { op: 'list' });
    } catch (mapped) {
      expect(mapped.statusCode).toBe(500);
      expect(mapped.code).toBe('DB_OPERATION_FAILED');
    }

    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});