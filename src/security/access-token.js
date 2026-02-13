import jwt from 'jsonwebtoken';

/**
 * Shared JWT issuer used by login/register and implicit guest checkout sessions.
 */
export function issueAccessToken({ id, role, isGuest = false, expiresIn = '15m' }) {
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