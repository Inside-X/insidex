import errorHandler from '../../src/middlewares/error-handler.js';
import { AppError } from '../../src/errors/app-error.js';

function createResponse() {
  return {
    statusCode: 200,
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

describe('error handler production masking', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  test('returns AppError message as-is in production', () => {
    process.env.NODE_ENV = 'production';
    const res = createResponse();

    const err = new AppError({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid payload',
      details: [{ path: ['email'], message: 'Invalid email' }],
    });

    errorHandler(err, { requestId: 'req-1' }, res);

    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: [{ path: ['email'], message: 'Invalid email' }],
        requestId: 'req-1',
      },
    });
  });

  test('masks non-AppError 5xx message in production and omits stack', () => {
    process.env.NODE_ENV = 'production';
    const res = createResponse();

    const err = new Error('DB timeout leaked message');
    err.statusCode = 500;
    err.stack = 'fake-stack';

    errorHandler(err, { requestId: 'req-2' }, res);

    expect(res.statusCode).toBe(500);
    expect(res.payload.error.message).toBe('Internal server error');
    expect(res.payload.error.stack).toBeUndefined();
    expect(res.payload.error.requestId).toBe('req-2');
  });

  test('keeps non-AppError 5xx message in development for debugging', () => {
    process.env.NODE_ENV = 'development';
    const res = createResponse();

    const err = new Error('detailed failure');
    err.statusCode = 500;
    err.stack = 'dev-stack';

    errorHandler(err, {}, res);

    expect(res.statusCode).toBe(500);
    expect(res.payload.error.message).toBe('detailed failure');
    expect(res.payload.error.stack).toBe('dev-stack');
  });
});