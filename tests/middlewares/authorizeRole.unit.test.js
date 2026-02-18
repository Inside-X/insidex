import { jest } from '@jest/globals';

async function importAuthorizeRoleModule({
  requireAuthenticatedSubjectResult = true,
  normalizedAuthRole = 'admin',
  sendApiErrorReturnValue = { sent: true },
} = {}) {
  jest.resetModules();

  const sendApiError = jest.fn(() => sendApiErrorReturnValue);
  const requireAuthenticatedSubject = jest.fn(() => requireAuthenticatedSubjectResult);
  const getNormalizedAuthRole = jest.fn(() => normalizedAuthRole);

  await jest.unstable_mockModule('../../src/utils/api-error.js', () => ({
    sendApiError,
  }));

  await jest.unstable_mockModule('../../src/middlewares/rbac.js', () => ({
    requireAuthenticatedSubject,
    getNormalizedAuthRole,
  }));

  const mod = await import('../../src/middlewares/authorizeRole.js');
  return {
    ...mod,
    sendApiError,
    requireAuthenticatedSubject,
    getNormalizedAuthRole,
  };
}

describe('src/middlewares/authorizeRole.js', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('throws for invalid role configuration (empty array, blank role, non-string, undefined)', async () => {
    const { authorizeRole } = await importAuthorizeRoleModule();

    expect(() => authorizeRole([])).toThrow('authorizeRole expects a non-empty role string or array of non-empty role strings');
    expect(() => authorizeRole(['admin', '   '])).toThrow('authorizeRole expects a non-empty role string or array of non-empty role strings');
    expect(() => authorizeRole(['admin', null])).toThrow('authorizeRole expects a non-empty role string or array of non-empty role strings');
    expect(() => authorizeRole(undefined)).toThrow('authorizeRole expects a non-empty role string or array of non-empty role strings');
  });

  test('returns early when subject is unauthenticated and does not evaluate role or next', async () => {
    const { authorizeRole, requireAuthenticatedSubject, getNormalizedAuthRole, sendApiError } = await importAuthorizeRoleModule({
      requireAuthenticatedSubjectResult: false,
    });

    const req = { auth: {}, requestId: 'req-unauth' };
    const res = {};
    const next = jest.fn();

    const middleware = authorizeRole('admin');
    const result = middleware(req, res, next);

    expect(result).toBeUndefined();
    expect(requireAuthenticatedSubject).toHaveBeenCalledTimes(1);
    expect(requireAuthenticatedSubject).toHaveBeenCalledWith(req, res);
    expect(getNormalizedAuthRole).not.toHaveBeenCalled();
    expect(sendApiError).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when role is missing after authentication', async () => {
    const forbiddenBody = {
      error: {
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
        requestId: 'req-403-missing',
      },
    };

    const { authorizeRole, requireAuthenticatedSubject, getNormalizedAuthRole, sendApiError } = await importAuthorizeRoleModule({
      requireAuthenticatedSubjectResult: true,
      normalizedAuthRole: null,
      sendApiErrorReturnValue: forbiddenBody,
    });

    const req = { auth: { sub: 'u1', role: null }, requestId: 'req-403-missing' };
    const res = { status: jest.fn(), json: jest.fn() };
    const next = jest.fn();

    const middleware = authorizeRole('admin');
    const result = middleware(req, res, next);

    expect(requireAuthenticatedSubject).toHaveBeenCalledWith(req, res);
    expect(getNormalizedAuthRole).toHaveBeenCalledTimes(1);
    expect(getNormalizedAuthRole).toHaveBeenCalledWith(req);
    expect(sendApiError).toHaveBeenCalledTimes(1);
    expect(sendApiError).toHaveBeenCalledWith(req, res, 403, 'FORBIDDEN', 'Insufficient permissions');
    expect(result).toBe(forbiddenBody);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when normalized role is not in allowed list', async () => {
    const forbiddenBody = {
      error: {
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
        requestId: 'req-403-denied',
      },
    };

    const { authorizeRole, getNormalizedAuthRole, sendApiError } = await importAuthorizeRoleModule({
      normalizedAuthRole: 'guest',
      sendApiErrorReturnValue: forbiddenBody,
    });

    const req = { auth: { sub: 'u2', role: 'guest' }, requestId: 'req-403-denied' };
    const res = { status: jest.fn(), json: jest.fn() };
    const next = jest.fn();

    const middleware = authorizeRole(['admin', 'ops']);
    const result = middleware(req, res, next);

    expect(getNormalizedAuthRole).toHaveBeenCalledWith(req);
    expect(sendApiError).toHaveBeenCalledTimes(1);
    expect(sendApiError).toHaveBeenCalledWith(req, res, 403, 'FORBIDDEN', 'Insufficient permissions');
    expect(result).toBe(forbiddenBody);
    expect(next).not.toHaveBeenCalled();
  });

  test('allows request when normalized role matches trimmed/case-insensitive allowed roles', async () => {
    const { authorizeRole, sendApiError, getNormalizedAuthRole } = await importAuthorizeRoleModule({
      normalizedAuthRole: 'admin',
    });

    const req = { auth: { sub: 'u3', role: ' ADMIN ' }, requestId: 'req-allow' };
    const res = { status: jest.fn(), json: jest.fn() };
    const next = jest.fn(() => 'next-called');

    const middleware = authorizeRole(['  ADMIN  ', 'Ops']);
    const result = middleware(req, res, next);

    expect(getNormalizedAuthRole).toHaveBeenCalledTimes(1);
    expect(sendApiError).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(result).toBe('next-called');
  });
});