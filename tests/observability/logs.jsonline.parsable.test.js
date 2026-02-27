import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { logger } from '../../src/utils/logger.js';
import { requestContext } from '../../src/middlewares/requestContext.js';
import { requestLogger } from '../../src/middlewares/requestLogger.js';
import errorHandler from '../../src/middlewares/error-handler.js';

function collectConsoleLines(spies) {
  return [...spies.log.mock.calls, ...spies.warn.mock.calls, ...spies.error.mock.calls].map((call) => call[0]);
}

function assertJsonLine(line) {
  expect(typeof line).toBe('string');
  const parsed = JSON.parse(line);
  expect(parsed).toEqual(expect.objectContaining({
    level: expect.any(String),
    event: expect.any(String),
    timestamp: expect.any(String),
  }));
  return parsed;
}

describe('logs json-line parsable governance', () => {
  let spies;

  beforeEach(() => {
    spies = {
      log: jest.spyOn(console, 'log').mockImplementation(() => {}),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    spies.log.mockRestore();
    spies.warn.mockRestore();
    spies.error.mockRestore();
  });

  test('direct logger emissions are strict single-line JSON with required keys', () => {
    logger.info('unit_event_ok', { correlationId: 'corr-unit-1', count: 1 });
    logger.error('unit_event_err', { correlationId: 'corr-unit-2', cause: 'x' });

    const lines = collectConsoleLines(spies);
    expect(lines.length).toBe(2);

    for (const line of lines) {
      const parsed = assertJsonLine(line);
      expect(line.includes('\n')).toBe(false);
      expect(parsed.event).toMatch(/^unit_event_/);
    }
  });

  test('request lifecycle logs are valid JSON and include correlationId consistently', async () => {
    const app = express();
    app.use(requestContext);
    app.use(requestLogger);
    app.get('/ok', (_req, res) => res.status(200).json({ ok: true }));
    app.get('/boom', () => {
      throw new Error('boom');
    });
    app.use(errorHandler);

    await request(app).get('/ok').set('x-correlation-id', 'corr-req-200');
    await request(app).get('/boom').set('x-correlation-id', 'corr-req-500');

    const lines = collectConsoleLines(spies);
    expect(lines.length).toBeGreaterThan(0);

    const parsedEntries = lines.map(assertJsonLine);
    const requestEntries = parsedEntries.filter((entry) =>
      ['http_request_started', 'http_request', 'http_request_failed', 'api_error'].includes(entry.event)
    );

    expect(requestEntries.length).toBeGreaterThanOrEqual(4);
    for (const entry of requestEntries) {
      expect(entry.correlationId).toBeDefined();
      expect(typeof entry.correlationId).toBe('string');
      expect(entry.correlationId.length).toBeGreaterThan(0);
    }
  });
});