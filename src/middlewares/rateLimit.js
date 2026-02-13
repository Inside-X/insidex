import { sendApiError } from '../utils/api-error.js';

function createRateLimiter({ windowMs, max, code, message }) {
  const buckets = new Map();

  function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const resolvedWindowMs = typeof windowMs === 'function' ? windowMs() : windowMs;
    const resolvedMax = typeof max === 'function' ? max() : max;
    const bucket = buckets.get(key) ?? { count: 0, resetAt: now + resolvedWindowMs };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + resolvedWindowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > resolvedMax) {
      if (typeof res.setHeader === 'function') {
        res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      }
      return sendApiError(req, res, 429, code, message);
    }

    return next();
  }

  rateLimiter.reset = () => buckets.clear();

  return rateLimiter;
}

export const apiRateLimiter = createRateLimiter({
  windowMs: () => Number(process.env.API_RATE_WINDOW_MS || 60_000),
  max: () => Number(process.env.API_RATE_MAX || 120),
  code: 'API_RATE_LIMITED',
  message: 'Too many requests',
});

export const strictAuthRateLimiter = createRateLimiter({
  windowMs: () => Number(process.env.AUTH_RATE_WINDOW_MS || 60_000),
  max: () => Number(process.env.AUTH_RATE_MAX || 20),
  code: 'RATE_LIMITED',
  message: 'Too many authentication attempts',
});

export function resetRateLimiters() {
  apiRateLimiter.reset();
  strictAuthRateLimiter.reset();
}

export default createRateLimiter;