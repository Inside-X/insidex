import jwt from 'jsonwebtoken';
import { getAccessTokenConfig, getRefreshTokenConfig } from './jwt-config.js';

function verifyToken(token, config) {
  if (!config.secret || !config.issuer || !config.audience) {
    return { ok: false, reason: 'misconfigured' };
  }

  if (typeof token !== 'string' || !token.trim()) {
    return { ok: false, reason: 'invalid' };
  }

  try {
    const payload = jwt.verify(token, config.secret, {
      algorithms: ['HS256'],
      issuer: config.issuer,
      audience: config.audience,
      maxAge: config.expiry,
      clockTolerance: 5,
      ignoreExpiration: false,
      complete: false,
    });

    if (!payload || typeof payload !== 'object' || typeof payload.exp !== 'number') {
      return { ok: false, reason: 'invalid' };
    }
    
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

export function verifyAccessToken(token, env = process.env) {
  return verifyToken(token, getAccessTokenConfig(env));
}

export function verifyRefreshToken(token, env = process.env) {
  return verifyToken(token, getRefreshTokenConfig(env));
}