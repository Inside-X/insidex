import { createRedisRateLimitStore } from '../lib/rate-limit-redis-store.js';
import { sendApiError } from '../utils/api-error.js';
import { logger } from '../utils/logger.js';

function normalizePath(pathname = '') {
  return String(pathname)
    .split('?')[0]
    .replace(/\/+/g, '/')
    .replace(/\/$/, '') || '/';
}

function resolveRouteScope(req) {
  const path = normalizePath(req.originalUrl || req.baseUrl || req.path || '/');

  if (path.startsWith('/api/auth')) return 'auth';
  if (path.includes('/checkout') || path.startsWith('/api/payments')) return 'checkout';
  if (path.startsWith('/api/orders')) return 'orders';
  if (path.startsWith('/api/webhooks')) return 'webhooks';
  return 'public';
}

function resolveIdentifier(req) {
  const ip = req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const route = normalizePath(req.baseUrl || req.path || req.originalUrl || '/');
  const method = String(req.method || 'GET').toUpperCase();
  const scope = resolveRouteScope(req);

  return `${scope}:${ip}:${method}:${route}`;
}

function createInMemorySlidingStore() {
  const buckets = new Map();

  function cleanup(now = Date.now()) {
    for (const [key, bucket] of buckets.entries()) {
      const nextEvents = bucket.events.filter((eventMs) => eventMs > now - bucket.windowMs);
      if (nextEvents.length === 0) {
        buckets.delete(key);
      } else {
        bucket.events = nextEvents;
      }
    }
  }

  return {
    async consume({ key, now, windowMs, max }) {
      const bucket = buckets.get(key) || { events: [], windowMs };
      bucket.windowMs = windowMs;
      bucket.events = bucket.events.filter((eventMs) => eventMs > now - windowMs);
      bucket.events.push(now);
      buckets.set(key, bucket);

      if (bucket.events.length > max) {
        const retryAfterMs = Math.max(1, windowMs - (now - bucket.events[0]));
        cleanup(now);
        return { allowed: false, count: bucket.events.length, retryAfterMs };
      }

      cleanup(now);
      return { allowed: true, count: bucket.events.length, retryAfterMs: 0 };
    },
    async reset() {
      buckets.clear();
    },
  };
}

function createRateLimiter({ windowMs, max, code, message, keyPrefix, namespace, store }) {
  const rateLimitStore = store
    || (process.env.NODE_ENV === 'test' ? createInMemorySlidingStore() : createRedisRateLimitStore({ keyPrefix, namespace }));

  function rateLimiter(req, res, next) {
    const now = Date.now();
    const resolvedWindowMs = typeof windowMs === 'function' ? windowMs(req) : windowMs;
    const resolvedMax = typeof max === 'function' ? max(req) : max;

    rateLimitStore
      .consume({ key: resolveIdentifier(req), now, windowMs: resolvedWindowMs, max: resolvedMax })
      .then(({ allowed, retryAfterMs }) => {
        if (!allowed) {
          if (typeof res.setHeader === 'function') {
            res.setHeader('Retry-After', Math.max(1, Math.ceil(retryAfterMs / 1000)));
          }
          sendApiError(req, res, 429, code, message);
          return;
        }

        next();
      })
      .catch((error) => {
        logger.warn('rate_limit_store_unavailable_fail_open', {
          message: error?.message,
          route: req.originalUrl,
          namespace,
        });
        next();
      });
  }

  rateLimiter.reset = () => rateLimitStore.reset();

  return rateLimiter;
}

export const apiRateLimiter = createRateLimiter({
  windowMs: () => Number(process.env.API_RATE_WINDOW_MS || 60_000),
  max: () => Number(process.env.API_RATE_MAX || 120),
  code: 'API_RATE_LIMITED',
  message: 'Too many requests',
  namespace: 'api',
});

export const strictAuthRateLimiter = createRateLimiter({
  windowMs: () => Number(process.env.AUTH_RATE_WINDOW_MS || 60_000),
  max: () => Number(process.env.AUTH_RATE_MAX || 20),
  code: 'RATE_LIMITED',
  message: 'Too many authentication attempts',
  namespace: 'auth',
});

export async function resetRateLimiters() {
  await Promise.all([apiRateLimiter.reset(), strictAuthRateLimiter.reset()]);
}

export { resolveIdentifier, resolveRouteScope };

export default createRateLimiter;