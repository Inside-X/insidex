import jwt from 'jsonwebtoken';
import { getRefreshTokenConfig } from './jwt-config.js';

export function issueRefreshToken({ id, role, isGuest = false, expiresIn } = {}) {
  const refreshConfig = getRefreshTokenConfig();

  return jwt.sign(
    { sub: id, role, isGuest },
    refreshConfig.secret,
    {
      algorithm: 'HS256',
      expiresIn: expiresIn || refreshConfig.expiry,
      issuer: refreshConfig.issuer,
      audience: refreshConfig.audience,
    }
  );
}

export default issueRefreshToken;