import { jest } from '@jest/globals';
const normalizeRole = jest.fn((r) => (typeof r === 'string' ? r.trim().toLowerCase() : null));
const sendApiError = jest.fn();
jest.unstable_mockModule('../../src/security/rbac-policy.js', () => ({ normalizeRole }));
jest.unstable_mockModule('../../src/utils/api-error.js', () => ({ sendApiError }));
const { requireAuthenticatedSubject, getNormalizedAuthRole, hasCheckoutIdentityAccess } = await import('../../src/middlewares/rbac.js');
describe('rbac middleware helpers', () => {
  test('requireAuthenticatedSubject false when missing sub', () => {
    const req = { auth: {} }; const res = {};
    expect(requireAuthenticatedSubject(req, res)).toBe(false);
    expect(sendApiError).toHaveBeenCalledWith(req, res, 401, 'UNAUTHORIZED', 'Authentication required');
  });
  test('requireAuthenticatedSubject true when sub exists', () => {
    expect(requireAuthenticatedSubject({ auth: { sub: 'u1' } }, {})).toBe(true);
  });
  test('getNormalizedAuthRole delegates', () => {
    expect(getNormalizedAuthRole({ auth: { role: ' Admin ' } })).toBe('admin');
  });
  test.each([
    [{ auth: { role: 'customer', isGuest: false } }, true],
    [{ auth: { role: 'guest', isGuest: true } }, true],
    [{ auth: { role: 'guest', isGuest: false } }, false],
    [{ auth: { role: 'customer', isGuest: true } }, false],
    [{ auth: { role: 'customer' } }, false],
  ])('hasCheckoutIdentityAccess', (req, expected) => { expect(hasCheckoutIdentityAccess(req)).toBe(expected); });
});