import { sendApiError } from '../utils/api-error.js';

function parseAllowedOrigins() {
  return (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowed(origin, allowedOrigins) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

export function corsMiddleware(req, res, next) {
  const allowedOrigins = parseAllowedOrigins();
  const origin = req.headers.origin;

  if (process.env.NODE_ENV === 'production' && (!allowedOrigins.length || allowedOrigins.includes('*'))) {
    return sendApiError(req, res, 500, 'CORS_MISCONFIGURED', 'CORS origin must be explicit in production');
  }

  if (allowedOrigins.length > 0) {
    if (!isAllowed(origin, allowedOrigins)) {
      return sendApiError(req, res, 403, 'CORS_FORBIDDEN', 'Origin not allowed');
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return next();
}

export default corsMiddleware;