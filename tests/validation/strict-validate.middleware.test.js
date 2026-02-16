import { jest } from '@jest/globals';
import { z } from 'zod';
import { strictValidate } from '../../src/validation/strict-validate.middleware.js';

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

describe('strictValidate middleware', () => {
  test('throws for unsupported property selector', () => {
    expect(() => strictValidate(z.object({}), 'headers')).toThrow('strictValidate middleware received invalid property');
  });

  test('parses valid payload and calls next for body', () => {
    const middleware = strictValidate(z.object({ email: z.string().email() }));
    const req = { body: { email: 'valid@insidex.test' } };
    const res = createResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({ email: 'valid@insidex.test' });
    expect(res.statusCode).toBeNull();
  });

  test('returns 400 for unknown field injection', () => {
    const middleware = strictValidate(z.object({ a: z.string() }).strict());
    const req = { body: { a: 'ok', extra: true }, requestId: 'req-123' };
    const res = createResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        requestId: 'req-123',
        details: [],
      },
    });
  });

  test('returns 400 for empty body when required field is missing', () => {
    const middleware = strictValidate(z.object({ a: z.string() }));
    const req = { body: {}, requestId: 'req-empty' };
    const res = createResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.payload.error.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 for malformed payload type (array instead of object)', () => {
    const middleware = strictValidate(z.object({ a: z.string() }));
    const req = { body: ['bad'], requestId: 'req-array' };
    const res = createResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  test('returns 400 for null vs required object payload', () => {
    const middleware = strictValidate(z.object({ a: z.string() }));
    const req = { body: null, requestId: 'req-null' };
    const res = createResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  test('parses params payload when property is params', () => {
    const middleware = strictValidate(z.object({ id: z.string().uuid() }), 'params');
    const req = { params: { id: '00000000-0000-0000-0000-000000000777' } };
    const res = createResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.params.id).toBe('00000000-0000-0000-0000-000000000777');
  });

  test('forwards unexpected parser errors via next(error)', () => {
    const explodingSchema = { parse: () => { throw new Error('boom'); } };
    const middleware = strictValidate(explodingSchema);
    const req = { body: { a: 'x' } };
    const res = createResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const [error] = next.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('boom');
    expect(res.statusCode).toBeNull();
  });
});