import { jest } from '@jest/globals';
const sendApiError = jest.fn();
const requireAuthenticatedSubject = jest.fn();
const getNormalizedAuthRole = jest.fn();
jest.unstable_mockModule('../../src/utils/api-error.js', () => ({ sendApiError }));
jest.unstable_mockModule('../../src/middlewares/rbac.js', () => ({ requireAuthenticatedSubject, getNormalizedAuthRole }));
const { authorizeRole } = await import('../../src/middlewares/authorizeRole.js');
describe('authorizeRole', () => {
  test('throws invalid config', () => { expect(() => authorizeRole('')).toThrow(); expect(() => authorizeRole([])).toThrow(); });
  test('unauthenticated short-circuit', () => {
    const mw = authorizeRole('admin'); requireAuthenticatedSubject.mockReturnValueOnce(false); const next = jest.fn();
    expect(mw({}, {}, next)).toBeUndefined(); expect(next).not.toHaveBeenCalled();
  });
  test('forbidden on mismatch', () => {
    const mw = authorizeRole(['admin']); requireAuthenticatedSubject.mockReturnValueOnce(true); getNormalizedAuthRole.mockReturnValueOnce('customer');
    const req = {}; const res = {}; mw(req, res, jest.fn());
    expect(sendApiError).toHaveBeenCalledWith(req, res, 403, 'FORBIDDEN', 'Insufficient permissions');
  });
  test('next on match', () => {
    const mw = authorizeRole([' Admin ']); requireAuthenticatedSubject.mockReturnValueOnce(true); getNormalizedAuthRole.mockReturnValueOnce('admin');
    const next = jest.fn(); mw({}, {}, next); expect(next).toHaveBeenCalled();
  });
});