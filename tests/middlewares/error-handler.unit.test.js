import { jest } from '@jest/globals';
async function loadHandlerWithLoggerMock() {
  jest.resetModules();
  const logger = { warn: jest.fn(), error: jest.fn() };
  await jest.unstable_mockModule('../../src/utils/logger.js', () => ({ logger }));
  const mod = await import('../../src/middlewares/error-handler.js');
  const { AppError } = await import('../../src/errors/app-error.js');
  return { errorHandler: mod.default, logger, AppError };
}

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('error-handler middleware', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('handles AppError with mapped status/code/message/details and requestId', async () => {
    process.env.NODE_ENV = 'development';
    const { errorHandler, logger, AppError } = await loadHandlerWithLoggerMock();
    const res = makeRes();
    const err = new AppError({ statusCode: 422, code: 'INVALID', message: 'Bad input', details: [{ field: 'x' }] });

    errorHandler(err, { requestId: 'req-1' }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INVALID',
        message: 'Bad input',
        details: [{ field: 'x' }],
        requestId: 'req-1',
      },
    });
    expect(logger.warn).toHaveBeenCalledWith('api_error', expect.objectContaining({
      code: 'INVALID',
      message: 'Bad input',
      requestId: 'req-1',
      details: [{ field: 'x' }],
      stack: err.stack,
    }));
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('non-AppError with explicit err.statusCode in 4xx preserves message and stack in development', async () => {
    process.env.NODE_ENV = 'development';
    const { errorHandler, logger } = await loadHandlerWithLoggerMock();
    const res = makeRes();
    const err = Object.assign(new Error('Invalid payload'), { statusCode: 400, code: 'BAD_PAYLOAD' });

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'BAD_PAYLOAD',
        message: 'Invalid payload',
        details: [],
        stack: err.stack,
      },
    });
    expect(logger.warn).toHaveBeenCalledWith('api_error', expect.objectContaining({ stack: err.stack }));
  });

  test('non-AppError with err.status branch in 4xx', async () => {
    process.env.NODE_ENV = 'development';
    const { errorHandler, logger } = await loadHandlerWithLoggerMock();
    const res = makeRes();
    const err = Object.assign(new Error('Unauthorized'), { status: 401, code: 'UNAUTHORIZED' });

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
        details: [],
        stack: err.stack,
      },
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  test('unknown error in development maps to 500 and exposes stack/message', async () => {
    process.env.NODE_ENV = 'development';
    const { errorHandler, logger } = await loadHandlerWithLoggerMock();
    const res = makeRes();
    const err = new Error('runtime failure');

    errorHandler(err, { requestId: 'req-dev' }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'runtime failure',
        details: [],
        stack: err.stack,
        requestId: 'req-dev',
      },
    });
    expect(logger.error).toHaveBeenCalledWith('api_error', expect.objectContaining({
      code: 'INTERNAL_ERROR',
      message: 'runtime failure',
      stack: err.stack,
    }));
  });

  test('unknown error in production hides internal message/stack and logs sanitized stack', async () => {
    process.env.NODE_ENV = 'production';
    const { errorHandler, logger } = await loadHandlerWithLoggerMock();
    const res = makeRes();
    const err = new Error('sensitive db detail');

    errorHandler(err, { requestId: 'req-prod' }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        details: [],
        requestId: 'req-prod',
      },
    });
    expect(logger.error).toHaveBeenCalledWith('api_error', expect.objectContaining({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      stack: undefined,
    }));
  });

  test('unknown/null error object fallback behavior and default request-failed message for 4xx without message', async () => {
    process.env.NODE_ENV = 'development';
    const { errorHandler, logger } = await loadHandlerWithLoggerMock();

    const res1 = makeRes();
    errorHandler({ statusCode: 429, code: 'RATE_LIMITED' }, {}, res1, jest.fn());
    expect(res1.status).toHaveBeenCalledWith(429);
    expect(res1.json).toHaveBeenCalledWith({
      error: {
        code: 'RATE_LIMITED',
        message: 'Request failed',
        details: [],
      },
    });
    expect(logger.warn).toHaveBeenCalled();

    const res2 = makeRes();
    errorHandler(null, {}, res2, jest.fn());
    expect(res2.status).toHaveBeenCalledWith(500);
    expect(res2.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        details: [],
      },
    });
  });
});