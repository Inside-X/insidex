import {
  AppError,
  AuthError,
  ForbiddenError,
  InternalError,
  NotFoundError,
} from '../../src/errors/app-error.js';

describe('AppError hierarchy', () => {
  test('AppError constructor uses default values and preserves Error inheritance/stack', () => {
    const err = new AppError();

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe('AppError');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.message).toBe('Internal server error');
    expect(err.details).toEqual([]);
    expect(typeof err.stack).toBe('string');
    expect(err.stack).toContain('Internal server error');
  });

  test('AppError constructor accepts custom message/status/code/details and normalizes invalid details', () => {
    const custom = new AppError({
      statusCode: 422,
      code: 'CUSTOM_CODE',
      message: 'Custom message',
      details: [{ field: 'email', message: 'invalid' }],
    });

    expect(custom.statusCode).toBe(422);
    expect(custom.code).toBe('CUSTOM_CODE');
    expect(custom.message).toBe('Custom message');
    expect(custom.details).toEqual([{ field: 'email', message: 'invalid' }]);

    const invalidDetails = new AppError({ details: 'not-array' });
    expect(invalidDetails.details).toEqual([]);
  });

  test('AuthError inheritance, defaults and custom overrides', () => {
    const base = new AuthError();
    expect(base).toBeInstanceOf(Error);
    expect(base).toBeInstanceOf(AppError);
    expect(base).toBeInstanceOf(AuthError);
    expect(base.name).toBe('AuthError');
    expect(base.statusCode).toBe(401);
    expect(base.code).toBe('AUTH_ERROR');
    expect(base.message).toBe('Authentication required');
    expect(base.details).toEqual([]);

    const custom = new AuthError('Auth custom', [{ field: 'token', message: 'missing' }]);
    expect(custom.message).toBe('Auth custom');
    expect(custom.details).toEqual([{ field: 'token', message: 'missing' }]);
  });

  test('ForbiddenError inheritance, defaults and custom overrides', () => {
    const base = new ForbiddenError();
    expect(base).toBeInstanceOf(AppError);
    expect(base).toBeInstanceOf(ForbiddenError);
    expect(base.name).toBe('ForbiddenError');
    expect(base.statusCode).toBe(403);
    expect(base.code).toBe('FORBIDDEN');
    expect(base.message).toBe('Forbidden');

    const custom = new ForbiddenError('Denied', [{ field: 'role', message: 'insufficient' }]);
    expect(custom.message).toBe('Denied');
    expect(custom.details).toEqual([{ field: 'role', message: 'insufficient' }]);
  });

  test('NotFoundError inheritance, defaults and custom overrides', () => {
    const base = new NotFoundError();
    expect(base).toBeInstanceOf(AppError);
    expect(base).toBeInstanceOf(NotFoundError);
    expect(base.name).toBe('NotFoundError');
    expect(base.statusCode).toBe(404);
    expect(base.code).toBe('NOT_FOUND');
    expect(base.message).toBe('Resource not found');

    const custom = new NotFoundError('Missing entity', [{ field: 'id', message: 'unknown' }]);
    expect(custom.message).toBe('Missing entity');
    expect(custom.details).toEqual([{ field: 'id', message: 'unknown' }]);
  });

  test('InternalError inheritance, defaults and custom overrides', () => {
    const base = new InternalError();
    expect(base).toBeInstanceOf(AppError);
    expect(base).toBeInstanceOf(InternalError);
    expect(base.name).toBe('InternalError');
    expect(base.statusCode).toBe(500);
    expect(base.code).toBe('INTERNAL_ERROR');
    expect(base.message).toBe('Internal server error');

    const custom = new InternalError('Oops', [{ field: 'db', message: 'down' }]);
    expect(custom.message).toBe('Oops');
    expect(custom.details).toEqual([{ field: 'db', message: 'down' }]);
  });
});