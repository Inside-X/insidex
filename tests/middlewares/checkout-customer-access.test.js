import { jest } from '@jest/globals';
import checkoutCustomerAccess from '../../src/middlewares/checkoutCustomerAccess.js';

function createResponse() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    },
  };
}

describe('checkoutCustomerAccess policy', () => {
  test('allows normalized customer role with non-guest identity', () => {
    const req = { auth: { sub: 'user-1', role: ' Customer ', isGuest: false } };
    const res = createResponse();
    const next = jest.fn();

    checkoutCustomerAccess(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });

  test('allows guest identity only with guest role + guest flag', () => {
    const req = { auth: { sub: 'guest-1', role: ' guest ', isGuest: true } };
    const res = createResponse();
    const next = jest.fn();

    checkoutCustomerAccess(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });

  test('rejects anonymous request with 401', () => {
    const req = { auth: null };
    const res = createResponse();
    const next = jest.fn();

    checkoutCustomerAccess(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.payload.error.code).toBe('UNAUTHORIZED');
  });

  test('rejects admin role with 403', () => {
    const req = { auth: { sub: 'admin-1', role: 'admin', isGuest: false } };
    const res = createResponse();
    const next = jest.fn();

    checkoutCustomerAccess(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.payload.error.code).toBe('FORBIDDEN');
  });

  test('rejects tampered guest claims with 403', () => {
    const req = { auth: { sub: 'guest-1', role: 'guest', isGuest: false } };
    const res = createResponse();
    const next = jest.fn();

    checkoutCustomerAccess(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.payload.error.code).toBe('FORBIDDEN');
  });
});