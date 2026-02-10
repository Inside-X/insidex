import jwt from 'jsonwebtoken';
import { normalizeRole } from '../security/rbac-policy.js';
import { sendApiError } from '../utils/api-error.js';

const BEARER_REGEX = /^Bearer\s+(.+)$/i;

function unauthorized(req, res, message) {
  return sendApiError(req, res, 401, 'UNAUTHORIZED', message);
}

function logAuthenticationFailure(reason, error) {
  console.warn(JSON.stringify({
    event: 'auth_failure',
    reason,
    detail: error?.message,
    requestId: error?.requestId,
  }));
}

/**
 * Authenticate a user from Authorization: Bearer <token> header.
 *
 * Expected token payload:
 * - sub: user id (string or number)
 * - role: optional, used by authorizeRole middleware
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

  const secret = process.env.JWT_ACCESS_SECRET;
  const issuer = process.env.JWT_ACCESS_ISSUER;
  const audience = process.env.JWT_ACCESS_AUDIENCE;

  if (!secret) {
    return sendApiError(req, res, 500, 'INTERNAL_ERROR', 'Authentication service misconfigured');
  }

  if ((issuer && !audience) || (!issuer && audience)) {
    return sendApiError(req, res, 500, 'INTERNAL_ERROR', 'Authentication service misconfigured');
  }
  
  try {
    const verifyOptions = {
      algorithms: ['HS256'],
    };

    if (issuer && audience) {
      verifyOptions.issuer = issuer;
      verifyOptions.audience = audience;
    }

    const decoded = jwt.verify(token, secret, verifyOptions);

    const id = decoded?.sub ?? decoded?.id;
    if (!id) {
      logAuthenticationFailure('token payload missing subject');
      return unauthorized(res, 'Authentication failed');
    }

    req.auth = {
      sub: id,
      role: normalizeRole(decoded?.role),
    };

    // Backward compatibility for existing handlers.
    req.user = {
      id,
      role: decoded?.role,
    };

    return next();
  } catch (error) {
    logAuthenticationFailure('token verification error', {
      ...error,
      requestId: req.requestId,
    });
    return unauthorized(req, res, 'Authentication failed');
  }
}

export default authenticate;