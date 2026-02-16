import { jest } from '@jest/globals';
import { enforceOrderOwnership } from '../../src/middlewares/checkoutCustomerAccess.js';

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

describe('enforceOrderOwnership middleware', () => {
  test('rejects anonymous request with 401', () => {
    const req = { auth: null, body: {} };
    const res = createResponse();
    const next = jest.fn();

    enforceOrderOwnership(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.payload.error.code).toBe('UNAUTHORIZED');
  });

  test('rejects client-provided userId with 400', () => {
    const req = {
      auth: { sub: '00000000-0000-0000-0000-000000000123' },
      body: { userId: '00000000-0000-0000-0000-000000000999' },
    };
    const res = createResponse();
    const next = jest.fn();

    enforceOrderOwnership(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.payload.error.code).toBe('VALIDATION_ERROR');
  });

  test('allows payload without userId and relies on auth.sub binding', () => {
    const req = {
      auth: { sub: '00000000-0000-0000-0000-000000000123' },
      body: { idempotencyKey: 'idem-ownership-12345' },
    };
    const res = createResponse();
    const next = jest.fn();

    enforceOrderOwnership(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });
});