import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import authenticate from '../../src/middlewares/authenticate.js';
import authorizeRole from '../../src/middlewares/authorizeRole.js';
import { getNormalizedAuthRole, hasCheckoutIdentityAccess, requireAuthenticatedSubject } from '../../src/middlewares/rbac.js';
import requirePermission from '../../src/middlewares/requirePermission.js';

function resMock() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

describe('auth middleware branch coverage', () => {
  test('authenticate rejects missing and malformed authorization header', () => {
    const req1 = { get: () => undefined };
    const res1 = resMock();
    authenticate(req1, res1, () => {});
    expect(res1.statusCode).toBe(401);

    const req2 = { get: () => 'Basic 123' };
    const res2 = resMock();
    authenticate(req2, res2, () => {});
    expect(res2.statusCode).toBe(401);
  });

  test('authenticate rejects invalid and missing subject tokens', () => {
    const badReq = { get: () => 'Bearer invalid.token.value', requestId: 'req-1' };
    const badRes = resMock();
    authenticate(badReq, badRes, () => {});
    expect(badRes.statusCode).toBe(401);

    const tokenNoSub = jwt.sign({ role: 'admin' }, process.env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      issuer: process.env.JWT_ACCESS_ISSUER,
      audience: process.env.JWT_ACCESS_AUDIENCE,
      expiresIn: '2m',
    });

    const reqNoSub = { get: () => `Bearer ${tokenNoSub}`, requestId: 'req-2' };
    const resNoSub = resMock();
    authenticate(reqNoSub, resNoSub, () => {});
    expect(resNoSub.statusCode).toBe(401);
  });

  test('authenticate sets normalized user on success', () => {
    const token = jwt.sign({ sub: 'u1', role: 'ADMIN', isGuest: false }, process.env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      issuer: process.env.JWT_ACCESS_ISSUER,
      audience: process.env.JWT_ACCESS_AUDIENCE,
      expiresIn: '2m',
    });

    const req = { get: () => `Bearer ${token}`, requestId: 'req-ok' };
    const res = resMock();
    const next = jest.fn();
    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.auth).toEqual({ sub: 'u1', role: 'admin', isGuest: false });
    expect(req.user.role).toBe('admin');
  });

  test('authorizeRole validates arguments and enforces role', () => {
    expect(() => authorizeRole([])).toThrow();

    const middleware = authorizeRole(['admin']);
    const reqForbidden = { auth: { sub: 'u1', role: 'customer' } };
    const resForbidden = resMock();
    middleware(reqForbidden, resForbidden, () => {});
    expect(resForbidden.statusCode).toBe(403);

    const reqOk = { auth: { sub: 'u1', role: 'admin' } };
    const resOk = resMock();
    const next = jest.fn();
    middleware(reqOk, resOk, next);
    expect(next).toHaveBeenCalled();
  });

  test('rbac helpers and requirePermission enforce permissions', () => {
    const reqUnauth = { auth: {} };
    const resUnauth = resMock();
    expect(requireAuthenticatedSubject(reqUnauth, resUnauth)).toBe(false);
    expect(resUnauth.statusCode).toBe(401);

    expect(getNormalizedAuthRole({ auth: { role: ' ADMIN ' } })).toBe('admin');
    expect(hasCheckoutIdentityAccess({ auth: { role: 'customer', isGuest: false } })).toBe(true);
    expect(hasCheckoutIdentityAccess({ auth: { role: 'guest', isGuest: true } })).toBe(true);
    expect(hasCheckoutIdentityAccess({ auth: { role: 'guest', isGuest: false } })).toBe(false);

    expect(() => requirePermission('')).toThrow();

    const requirePerm = requirePermission('admin:health:read');
    const unauthReq = { auth: {} };
    const unauthRes = resMock();
    requirePerm(unauthReq, unauthRes, () => {});
    expect(unauthRes.statusCode).toBe(401);

    const reqForbidden = { auth: { sub: 'u1', role: 'customer' } };
    const resForbidden = resMock();
    requirePerm(reqForbidden, resForbidden, () => {});
    expect(resForbidden.statusCode).toBe(403);

    const reqOk = { auth: { sub: 'u1', role: 'admin' } };
    const resOk = resMock();
    const next = jest.fn();
    requirePerm(reqOk, resOk, next);
    expect(next).toHaveBeenCalled();
  });
});