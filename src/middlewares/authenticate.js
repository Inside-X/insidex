import { normalizeRole } from '../security/rbac-policy.js';
import { verifyAccessToken } from '../security/token-verifier.js';
import { sendApiError } from '../utils/api-error.js';
import { logger } from '../utils/logger.js';

const BEARER_REGEX = /^Bearer\s+(.+)$/i;

function unauthorized(req, res, message) {
  return sendApiError(req, res, 401, 'UNAUTHORIZED', message);
}

function logAuthenticationFailure(reason, error) {
  logger.warn('auth_failure', { reason, detail: error?.message, requestId: error?.requestId });
}

/**
 * Authenticate a user from Authorization: Bearer <token> header.
 *
 * Expected token payload:
 * - sub: user id (string or number)
 * - role: optional, used by authorizeRole middleware
 * - isGuest: optional boolean for implicit guest sessions
 */
export function authenticate(req, res, next) {
  const authorizationHeader = req.get('authorization');

  if (!authorizationHeader) {
    return unauthorized(req, res, 'Authentication required');
  }

  const bearerMatch = authorizationHeader.match(BEARER_REGEX);
  if (!bearerMatch || !bearerMatch[1]) {
    return unauthorized(req, res, 'Authorization header must be in the format: Bearer <token>');
  }

  const token = bearerMatch[1].trim();
  if (!token) {
    return unauthorized(req, res, 'Authentication required');
  }

  const verification = verifyAccessToken(token);
  if (!verification.ok && verification.reason === 'misconfigured') {
    return sendApiError(req, res, 500, 'INTERNAL_ERROR', 'Authentication service misconfigured');
  }

  if (!verification.ok) {
    logAuthenticationFailure('token verification error', {
      message: 'Invalid access token',
      requestId: req.requestId,
    });
    return unauthorized(req, res, 'Authentication failed');
  }

  const decoded = verification.payload;
  const id = decoded?.sub ?? decoded?.id;
  if (!id) {
    logAuthenticationFailure('token payload missing subject');
    return unauthorized(req, res, 'Authentication failed');
  }

  req.auth = {
    sub: id,
    role: normalizeRole(decoded?.role),
    isGuest: decoded?.isGuest === true,
  };

  // Backward compatibility for existing handlers.
  req.user = {
    id,
    role: decoded?.role,
    isGuest: decoded?.isGuest === true,
  };

  return next();
}

export default authenticate;