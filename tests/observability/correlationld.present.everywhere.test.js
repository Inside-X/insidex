import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

async function buildHarness() {
  jest.resetModules();

  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  await jest.unstable_mockModule('../../src/utils/logger.js', () => ({ logger }));

  const { requestContext } = await import('../../src/middlewares/requestContext.js');
  const { requestLogger } = await import('../../src/middlewares/requestLogger.js');
  const errorHandler = (await import('../../src/middlewares/error-handler.js')).default;

  const app = express();
  app.use(requestContext);
  app.use(requestLogger);

  app.get('/ok', (_req, res) => res.status(200).json({ ok: true }));
  app.get('/boom', () => {
    throw new Error('boom');
  });

  app.use(errorHandler);

  return { app, logger };
}

function collectLogEntries(logger) {
  return [
    ...logger.debug.mock.calls,
    ...logger.info.mock.calls,
    ...logger.warn.mock.calls,
    ...logger.error.mock.calls,
  ].map((call) => ({ event: call[0], meta: call[1] }));
}

describe('observability correlationId governance', () => {
  test('200 route emits start/end logs with preserved incoming x-correlation-id', async () => {
    const { app, logger } = await buildHarness();

    const res = await request(app).get('/ok').set('x-correlation-id', 'corr-fixed-200');

    expect(res.status).toBe(200);
    expect(res.headers['x-correlation-id']).toBe('corr-fixed-200');
    expect(res.headers['x-request-id']).toBe('corr-fixed-200');

    const entries = collectLogEntries(logger).filter((entry) => ['http_request_started', 'http_request'].includes(entry.event));
    expect(entries.length).toBeGreaterThanOrEqual(2);

    for (const entry of entries) {
      expect(entry.meta.correlationId).toBe('corr-fixed-200');
      expect(entry.meta.requestId).toBe('corr-fixed-200');
    }
  });

  test('404 route emits lifecycle log with generated correlationId when header missing', async () => {
    const { app, logger } = await buildHarness();

    const res = await request(app).get('/not-found');

    expect(res.status).toBe(404);
    const correlationId = res.headers['x-correlation-id'];
    expect(correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(res.headers['x-request-id']).toBe(correlationId);

    const entries = collectLogEntries(logger).filter((entry) => ['http_request_started', 'http_request'].includes(entry.event));
    expect(entries.length).toBeGreaterThanOrEqual(2);

    for (const entry of entries) {
      expect(entry.meta.correlationId).toBe(correlationId);
      expect(entry.meta.requestId).toBe(correlationId);
    }
  });

  test('500 thrown error includes same correlationId across start/end/error logs', async () => {
    const { app, logger } = await buildHarness();

    const res = await request(app).get('/boom').set('x-correlation-id', 'corr-fixed-500');

    expect(res.status).toBe(500);
    expect(res.body.error.requestId).toBe('corr-fixed-500');

    const entries = collectLogEntries(logger).filter((entry) =>
      ['http_request_started', 'http_request_failed', 'api_error'].includes(entry.event)
    );
    expect(entries.length).toBeGreaterThanOrEqual(3);

    for (const entry of entries) {
      expect(entry.meta.correlationId).toBe('corr-fixed-500');
      expect(entry.meta.requestId).toBe('corr-fixed-500');
    }
  });
});