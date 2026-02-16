import jwt from 'jsonwebtoken';
import { getAccessTokenConfig, getRefreshTokenConfig } from './jwt-config.js';

function verifyToken(token, config) {
  if (!config.secret || !config.issuer || !config.audience) {
    return { ok: false, reason: 'misconfigured' };
  }

  try {
    const payload = jwt.verify(token, config.secret, {
      algorithms: ['HS256'],
      issuer: config.issuer,
      audience: config.audience,
    });

    return { ok: true, payload };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

function shouldAllowLegacyAccessToken(env = process.env) {
  return env.NODE_ENV !== 'production';
}

function verifyLegacyAccessToken(token, config) {
  if (!config.secret) {
    return { ok: false, reason: 'misconfigured' };
  }

  try {
    const payload = jwt.verify(token, config.secret, {
      algorithms: ['HS256'],
    });

    return { ok: true, payload };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

export function verifyAccessToken(token, env = process.env) {
  const accessConfig = getAccessTokenConfig(env);
  const strictResult = verifyToken(token, accessConfig);

  if (strictResult.ok || strictResult.reason === 'misconfigured' || !shouldAllowLegacyAccessToken(env)) {
    return strictResult;
  }

  return verifyLegacyAccessToken(token, accessConfig);
}

export function verifyRefreshToken(token, env = process.env) {
  return verifyToken(token, getRefreshTokenConfig(env));
}