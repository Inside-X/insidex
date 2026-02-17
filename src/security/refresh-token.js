import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getRefreshTokenConfig } from './jwt-config.js';

function parseExpiryToMs(expiry) {
  if (typeof expiry !== 'string') return null;
  const match = expiry.trim().match(/^(\d+)([smhd])$/i);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const unitMs = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  }[unit];

  return Number.isFinite(value) && unitMs ? value * unitMs : null;
}

export function issueRefreshToken({ userId, sessionId = crypto.randomUUID(), env = process.env } = {}) {
  const config = getRefreshTokenConfig(env);

  if (!config.secret || !config.issuer || !config.audience || !config.expiry) {
    return { ok: false, reason: 'misconfigured' };
  }

  const expiresInMs = parseExpiryToMs(config.expiry);
  if (!expiresInMs) {
    return { ok: false, reason: 'misconfigured' };
  }

  const token = jwt.sign(
    { sub: userId, sid: sessionId, type: 'refresh' },
    config.secret,
    {
      algorithm: 'HS256',
      expiresIn: config.expiry,
      issuer: config.issuer,
      audience: config.audience,
    }
  );

  return {
    ok: true,
    token,
    sessionId,
    expiresAt: Date.now() + expiresInMs,
  };
}

export default issueRefreshToken;