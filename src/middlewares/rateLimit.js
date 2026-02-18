import net from 'node:net';
import { sendApiError } from '../utils/api-error.js';
import { createRateLimitRedisStore } from '../lib/rate-limit-redis-store.js';

let rateLimitRedisClient = null;

export function setRateLimitRedisClient(client) {
  rateLimitRedisClient = client || null;
}

export function getRateLimitRedisClient() {
  return rateLimitRedisClient;
}

export async function isRateLimitBackendHealthy() {
  if (!rateLimitRedisClient || typeof rateLimitRedisClient.ping !== 'function') {
    return false;
  }

  try {
    await rateLimitRedisClient.ping();
    return true;
  } catch {
    return false;
  }
}

function sanitizeIp(candidate) {
  if (!candidate || typeof candidate !== 'string') return null;
  const normalized = candidate.trim().replace(/^\[|\]$/g, '').replace(/^::ffff:/, '').split(':')[0];
  return net.isIP(normalized) ? normalized : null;
}

function resolveClientIp(req) {
  const trustProxy = Boolean(req.app?.get?.('trust proxy'));
  const xForwardedFor = req.headers?.['x-forwarded-for'];

  if (!trustProxy && xForwardedFor) {
    throw new Error('x-forwarded-for_not_trusted');
  }

  if (trustProxy && xForwardedFor) {
    const firstHop = String(xForwardedFor).split(',')[0]?.trim();
    const spoofedIp = sanitizeIp(firstHop);
    if (!spoofedIp) {
      throw new Error('x-forwarded-for_malformed');
    }
  }

  const directIp = sanitizeIp(req.ip) || sanitizeIp(req.socket?.remoteAddress);
  if (!directIp) {
    throw new Error('ip_unresolved');
  }
  return directIp;
}

function endpointToken(req) {
  const path = String(req.path || req.originalUrl || 'root').split('?')[0];
  const token = path.split('/').filter(Boolean).join(':');
  return token || 'root';
}

function createRateLimiter({ windowMs, max, code, message, keyBuilder, store }) {
  if (!store || typeof store.increment !== 'function') {
    throw new Error('createRateLimiter requires a store with increment(key, windowMs)');
  }

  async function rateLimiter(req, res, next) {
    const resolvedWindowMs = typeof windowMs === 'function' ? windowMs() : windowMs;
    const resolvedMax = typeof max === 'function' ? max() : max;

    let key;
    try {
      key = keyBuilder(req);
    } catch {
      return sendApiError(req, res, 400, 'IP_SPOOFING_DETECTED', 'Invalid client network identity');
    }

    try {
      const result = await store.increment(key, resolvedWindowMs);
      const retryAfter = Math.max(0, Math.ceil((result.resetTime.getTime() - Date.now()) / 1000));
      if (typeof res.setHeader === 'function') {
        res.setHeader('Retry-After', retryAfter);
      }
      if (result.totalHits > resolvedMax) {
        return sendApiError(req, res, 429, code, message);
      }
      return next();
    } catch {
      return sendApiError(req, res, 503, 'RATE_LIMIT_BACKEND_UNAVAILABLE', 'Service temporarily unavailable');
    }
  }

  rateLimiter.reset = () => store.reset?.();

  return rateLimiter;
}

const redisStore = createRateLimitRedisStore({ getRedisClient: () => rateLimitRedisClient });

export const apiRateLimiter = createRateLimiter({
  windowMs: () => Number(process.env.API_RATE_WINDOW_MS || 60_000),
  max: () => Number(process.env.API_RATE_MAX || 120),
  code: 'API_RATE_LIMITED',
  message: 'Too many requests',
  keyBuilder: (req) => `rate:${endpointToken(req)}:${resolveClientIp(req)}`,
  store: redisStore,
});

export const strictAuthRateLimiter = createRateLimiter({
  windowMs: () => Number(process.env.AUTH_RATE_WINDOW_MS || 60_000),
  max: () => Number(process.env.AUTH_RATE_MAX || 20),
  code: 'RATE_LIMITED',
  message: 'Too many authentication attempts',
  keyBuilder: (req) => `rate:auth:${resolveClientIp(req)}`,
  store: redisStore,
});

export function resetRateLimiters() {
  apiRateLimiter.reset();
  strictAuthRateLimiter.reset();
}

export { createRateLimiter, resolveClientIp, endpointToken };

export default createRateLimiter;