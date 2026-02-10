const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 20;

const attemptsByIp = new Map();

/**
 * Prepared middleware for future auth endpoints (/login, /token/refresh, etc.).
 * Not mounted yet because this API currently validates tokens only.
 */
export function authRateLimiter(req, res, next) {
  const now = Date.now();
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';

  const bucket = attemptsByIp.get(ip) ?? { count: 0, resetAt: now + WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + WINDOW_MS;
  }

  bucket.count += 1;
  attemptsByIp.set(ip, bucket);

  if (bucket.count > MAX_ATTEMPTS) {
    return sendApiError(req, res, 429, 'RATE_LIMITED', 'Too many authentication attempts');
  }

  return next();
}

export default authRateLimiter;
import { sendApiError } from '../utils/api-error.js';