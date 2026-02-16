import jwt from 'jsonwebtoken';


function assertGuestTokenClaims({ role, isGuest }) {
  const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';

  if (isGuest === true && normalizedRole !== 'guest') {
    const error = new Error('Invalid guest token claims');
    error.statusCode = 500;
    error.code = 'GUEST_ISOLATION_VIOLATION';
    throw error;
  }

  if (normalizedRole === 'guest' && isGuest !== true) {
    const error = new Error('Invalid guest token claims');
    error.statusCode = 500;
    error.code = 'GUEST_ISOLATION_VIOLATION';
    throw error;
  }
}

/**
 * Shared JWT issuer used by login/register and implicit guest checkout sessions.
 */
export function issueAccessToken({ id, role, isGuest = false, expiresIn = '15m' }) {
  assertGuestTokenClaims({ role, isGuest });
  
  return jwt.sign(
    { sub: id, role, isGuest },
    process.env.JWT_ACCESS_SECRET,
    {
      algorithm: 'HS256',
      expiresIn,
      issuer: process.env.JWT_ACCESS_ISSUER,
      audience: process.env.JWT_ACCESS_AUDIENCE,
    }
  );
}

export default issueAccessToken;