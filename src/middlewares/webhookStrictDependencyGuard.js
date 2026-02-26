import { logger } from '../utils/logger.js';
import { sendApiError } from '../utils/api-error.js';
import { getRateLimitRedisClient } from './rateLimit.js';
import { assertDatabaseReady, getDependencyReasonCode } from '../lib/critical-dependencies.js';

function getCorrelationId(req) {
  return req.requestId || req.get('x-request-id') || 'unknown';
}

function isWebhookIdempotencyStrict() {
  const env = process.env;
  return env.NODE_ENV === 'production' || String(env.WEBHOOK_IDEMPOTENCY_STRICT || '').toLowerCase() === 'true';
}

function hasWebhookRedisBackend(req) {
  const redisClient = req.app.locals.webhookIdempotencyRedisClient || getRateLimitRedisClient();
  return Boolean(redisClient && typeof redisClient.set === 'function');
}

function sendDependencyUnavailable(req, res, dependency, error, endpoint) {
  const reasonCode = getDependencyReasonCode(dependency, error);
  logger.error('critical_dependency_unavailable', {
    endpoint,
    dependency,
    reasonCode,
    reason: error?.code || error?.message || 'unavailable',
    correlationId: getCorrelationId(req),
  });
  return sendApiError(req, res, 503, 'SERVICE_UNAVAILABLE', 'Critical dependency unavailable');
}

export async function webhookStrictDependencyGuard(req, res, next) {
  if (!isWebhookIdempotencyStrict()) return next();

  const requestPath = String(req.originalUrl || `${req.baseUrl || ''}${req.path || ''}`).split('?')[0].replace(/\/+$/, '');
  const endpoint = `POST ${requestPath || '/api/webhooks'}`;

  if (!hasWebhookRedisBackend(req)) {
    return sendDependencyUnavailable(req, res, 'redis', undefined, endpoint);
  }

  try {
    await assertDatabaseReady();
  } catch (error) {
    return sendDependencyUnavailable(req, res, 'db', error, endpoint);
  }

  return next();
}

export { isWebhookIdempotencyStrict, sendDependencyUnavailable };