import { describe, test, expect, jest, afterEach } from '@jest/globals';

async function loadGuardModule({ strictEnvValue = undefined, assertDatabaseReadyImpl = async () => undefined, redisClient = { set: jest.fn() } } = {}) {
  jest.resetModules();

  if (strictEnvValue === undefined) {
    delete process.env.WEBHOOK_IDEMPOTENCY_STRICT;
  } else {
    process.env.WEBHOOK_IDEMPOTENCY_STRICT = strictEnvValue;
  }

  const getRateLimitRedisClient = jest.fn(() => redisClient);
  const assertDatabaseReady = jest.fn(assertDatabaseReadyImpl);

  jest.unstable_mockModule('../../src/middlewares/rateLimit.js', () => ({
    getRateLimitRedisClient,
  }));
  jest.unstable_mockModule('../../src/lib/critical-dependencies.js', () => ({
    assertDatabaseReady,
    getDependencyReasonCode: jest.fn(() => 'db_unavailable'),
  }));
  jest.unstable_mockModule('../../src/utils/logger.js', () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/utils/api-error.js', () => ({
    sendApiError: jest.fn((_req, res, status) => res.status(status).json({})),
  }));

  const module = await import('../../src/middlewares/webhookStrictDependencyGuard.js');
  return { module, getRateLimitRedisClient, assertDatabaseReady };
}

describe('webhookStrictDependencyGuard', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousStrict = process.env.WEBHOOK_IDEMPOTENCY_STRICT;

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousStrict === undefined) delete process.env.WEBHOOK_IDEMPOTENCY_STRICT;
    else process.env.WEBHOOK_IDEMPOTENCY_STRICT = previousStrict;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test('strict mode OFF calls next without dependency checks', async () => {
    process.env.NODE_ENV = 'test';
    const { module, getRateLimitRedisClient, assertDatabaseReady } = await loadGuardModule({ strictEnvValue: 'false' });

    const req = {
      originalUrl: '/api/webhooks/paypal',
      app: { locals: {} },
      get: jest.fn(),
    };
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();

    await module.webhookStrictDependencyGuard(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(getRateLimitRedisClient).not.toHaveBeenCalled();
    expect(assertDatabaseReady).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });



  test('strict mode ON returns 503 when redis backend is unavailable', async () => {
    process.env.NODE_ENV = 'production';
    const { module, getRateLimitRedisClient, assertDatabaseReady } = await loadGuardModule({
      strictEnvValue: undefined,
      redisClient: null,
    });

    const req = {
      originalUrl: '/api/webhooks/stripe',
      app: { locals: {} },
      requestId: 'cid-redis',
      get: jest.fn(() => 'cid-redis'),
    };
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();

    await module.webhookStrictDependencyGuard(req, res, next);

    expect(getRateLimitRedisClient).toHaveBeenCalledTimes(1);
    expect(assertDatabaseReady).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });

  test('strict mode ON returns 503 when database preflight fails', async () => {
    process.env.NODE_ENV = 'production';
    const dbError = Object.assign(new Error('db down'), { code: 'ECONNREFUSED' });
    const { module, assertDatabaseReady } = await loadGuardModule({
      strictEnvValue: undefined,
      redisClient: { set: jest.fn() },
      assertDatabaseReadyImpl: async () => { throw dbError; },
    });

    const req = {
      originalUrl: '/api/webhooks/paypal',
      app: { locals: {} },
      requestId: 'cid-1',
      get: jest.fn(() => 'cid-1'),
    };
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();

    await module.webhookStrictDependencyGuard(req, res, next);

    expect(assertDatabaseReady).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });

  test('strict mode ON with dependencies OK invokes redis/database checks then next', async () => {
    process.env.NODE_ENV = 'test';
    const redisSet = jest.fn();
    const { module, getRateLimitRedisClient, assertDatabaseReady } = await loadGuardModule({
      strictEnvValue: 'true',
      redisClient: { set: redisSet },
      assertDatabaseReadyImpl: async () => true,
    });

    const req = {
      originalUrl: '/api/webhooks/stripe?attempt=1',
      app: { locals: {} },
      get: jest.fn(() => 'req-1'),
    };
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();

    await module.webhookStrictDependencyGuard(req, res, next);

    expect(getRateLimitRedisClient).toHaveBeenCalledTimes(1);
    expect(assertDatabaseReady).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});