import { jest } from '@jest/globals';
const sendApiError = jest.fn();
const roleHasPermission = jest.fn();
const requireAuthenticatedSubject = jest.fn();
const getNormalizedAuthRole = jest.fn();
jest.unstable_mockModule('../../src/utils/api-error.js', () => ({ sendApiError }));
jest.unstable_mockModule('../../src/security/rbac-policy.js', () => ({ roleHasPermission }));
jest.unstable_mockModule('../../src/middlewares/rbac.js', () => ({ requireAuthenticatedSubject, getNormalizedAuthRole }));
const { requirePermission } = await import('../../src/middlewares/requirePermission.js');
describe('requirePermission', () => {
  test('throws invalid config', () => { expect(() => requirePermission('')).toThrow(); });
  test('unauthenticated short-circuit', () => { const mw = requirePermission('x'); requireAuthenticatedSubject.mockReturnValueOnce(false); expect(mw({}, {}, jest.fn())).toBeUndefined(); });
  test('forbidden', () => {
    const mw = requirePermission(['a', 'b']); requireAuthenticatedSubject.mockReturnValueOnce(true); getNormalizedAuthRole.mockReturnValueOnce('customer'); roleHasPermission.mockReturnValue(false);
    const req = {}; const res = {}; mw(req, res, jest.fn()); expect(sendApiError).toHaveBeenCalledWith(req, res, 403, 'FORBIDDEN', 'Insufficient permissions');
  });
  test('next when any allowed', () => {
    const mw = requirePermission(['a', 'b']); requireAuthenticatedSubject.mockReturnValueOnce(true); getNormalizedAuthRole.mockReturnValueOnce('ops'); roleHasPermission.mockImplementation((_r, p) => p === 'b');
    const next = jest.fn(); mw({}, {}, next); expect(next).toHaveBeenCalled();
  });
});