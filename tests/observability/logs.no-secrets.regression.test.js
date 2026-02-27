import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { logger } from '../../src/utils/logger.js';
import { requestContext } from '../../src/middlewares/requestContext.js';
import { requestLogger } from '../../src/middlewares/requestLogger.js';
import errorHandler from '../../src/middlewares/error-handler.js';

const SECRET_AUTH = 'Bearer SECRET_TOKEN_123';
const SECRET_COOKIE = 'refreshToken=SECRET_REFRESH_456';
const SECRET_STRIPE_SIG = 't=1,v1=SECRET_SIG_789';

function collectRawOutput(spies) {
  return [...spies.log.mock.calls, ...spies.warn.mock.calls, ...spies.error.mock.calls]
    .map((call) => String(call[0]))
    .join('\n');
}

describe('logs no-secrets regression governance', () => {
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

  test('request and error lifecycle logs never expose authorization/cookie/stripe secrets', async () => {
    const app = express();
    app.use(requestContext);
    app.use(requestLogger);
    app.get('/boom', () => {
      throw new Error('request failed safely');
    });
    app.use(errorHandler);

    await request(app)
      .get('/boom')
      .set('Authorization', SECRET_AUTH)
      .set('cookie', SECRET_COOKIE)
      .set('stripe-signature', SECRET_STRIPE_SIG)
      .set('x-correlation-id', 'corr-secret-1');

    const output = collectRawOutput(spies);
    expect(output).not.toContain(SECRET_AUTH);
    expect(output).not.toContain(SECRET_COOKIE);
    expect(output).not.toContain(SECRET_STRIPE_SIG);
    expect(output).not.toContain('"headers"');
  });

  test('direct logger redacts sensitive keys and values deterministically', () => {
    logger.error('security_probe', {
      authorization: SECRET_AUTH,
      cookie: SECRET_COOKIE,
      stripeSignature: SECRET_STRIPE_SIG,
      note: 'safe-note',
      nested: { refreshToken: 'SECRET_REFRESH_456' },
    });

    const output = collectRawOutput(spies);
    expect(output).not.toContain(SECRET_AUTH);
    expect(output).not.toContain(SECRET_COOKIE);
    expect(output).not.toContain(SECRET_STRIPE_SIG);

    const parsed = JSON.parse(spies.error.mock.calls[0][0]);
    expect(parsed.authorization).toBe('[REDACTED]');
    expect(parsed.cookie).toBe('[REDACTED]');
    expect(parsed.stripeSignature).toBe('[REDACTED]');
    expect(parsed.nested.refreshToken).toBe('[REDACTED]');
  });
});