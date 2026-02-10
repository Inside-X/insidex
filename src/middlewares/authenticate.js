import jwt from 'jsonwebtoken';

const BEARER_REGEX = /^Bearer\s+(.+)$/i;

function unauthorized(res, message) {
  return res.status(401).json({
    error: {
      code: 'UNAUTHORIZED',
      message,
    },
  });
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
    return unauthorized(res, 'Authentication required');
  }

  const bearerMatch = authorizationHeader.match(BEARER_REGEX);
  if (!bearerMatch || !bearerMatch[1]) {
    return unauthorized(res, 'Authorization header must be in the format: Bearer <token>');
  }

  const token = bearerMatch[1].trim();
  if (!token) {
    return unauthorized(res, 'Authentication required');
  }

  const secret = process.env.JWT_ACCESS_SECRET;
  const issuer = process.env.JWT_ACCESS_ISSUER;
  const audience = process.env.JWT_ACCESS_AUDIENCE;

  if (!secret) {
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication service misconfigured',
      },
    });
  }

  if ((issuer && !audience) || (!issuer && audience)) {
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication service misconfigured',
      },
    });
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
      return unauthorized(res, 'Invalid token payload');
    }

    req.auth = {
      sub: id,
      role: decoded?.role,
      iat: decoded?.iat,
      exp: decoded?.exp,
    };

    // Backward compatibility for existing handlers.
    req.user = {
      id,
      role: decoded?.role,
    };

    return next();
  } catch (error) {
    return unauthorized(res, 'Authentication failed');
  }
}

export default authenticate;