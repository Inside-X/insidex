import { sendApiError } from '../utils/api-error.js';

function parseLimitToBytes(limit) {
  const normalized = String(limit || '').trim().toLowerCase();
  const match = normalized.match(/^(\d+)(b|kb|mb)?$/);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2] || 'b';
  const factor = unit === 'mb' ? 1024 * 1024 : unit === 'kb' ? 1024 : 1;
  return value * factor;
}

function getContentLength(req) {
  const value = req.get('content-length');
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function createPayloadGuard(options = {}) {
  const defaultJsonLimit = parseLimitToBytes(options.defaultJsonLimit || process.env.JSON_BODY_LIMIT || '1mb');
  const perRouteLimits = Object.entries(options.routeLimits || {
    '/api/webhooks/stripe': process.env.STRIPE_RAW_BODY_LIMIT || '512kb',
    '/api/webhooks/paypal': process.env.PAYPAL_RAW_BODY_LIMIT || '512kb',
  }).map(([prefix, limit]) => ({ prefix, bytes: parseLimitToBytes(limit) }));

  return function payloadGuard(req, res, next) {
    const method = String(req.method || 'GET').toUpperCase();
    if (!['POST', 'PUT', 'PATCH'].includes(method)) return next();

    const contentLength = getContentLength(req);
    if (contentLength == null) return next();

    const path = req.originalUrl || req.path || '';
    const routeOverride = perRouteLimits.find((route) => path.startsWith(route.prefix));
    const limit = routeOverride?.bytes || defaultJsonLimit;
    if (!limit) return next();

    if (contentLength > limit) {
      return sendApiError(req, res, 413, 'PAYLOAD_TOO_LARGE', 'Request payload too large');
    }

    return next();
  };
}

export const payloadGuard = createPayloadGuard();

export default payloadGuard;