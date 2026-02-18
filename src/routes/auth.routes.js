import crypto from 'crypto';
import express from 'express';
import { strictValidate } from '../validation/strict-validate.middleware.js';
import { authSchemas } from '../validation/schemas/index.js';
import { strictAuthRateLimiter } from '../middlewares/rateLimit.js';
import { sendApiError } from '../utils/api-error.js';
import { issueAccessToken } from '../security/access-token.js';
import { verifyRefreshToken } from '../security/token-verifier.js';
import issueRefreshToken from '../security/refresh-token.js';
import {
  revokeRefreshSession,
  rotateRefreshSession,
  storeRefreshSession,
  validateAndConsumeRefreshSession,
} from '../security/refresh-token-store.js';

const router = express.Router();

const REFRESH_COOKIE_NAME = 'refresh_token';

function refreshCookieConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim();

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/api/auth',
    ...(domain ? { domain } : {}),
    maxAge: 30 * 60 * 1000,
  };
}

function readRefreshToken(req) {
  const bodyToken = req.body?.refreshToken;
  if (typeof bodyToken === 'string' && bodyToken.trim()) {
    return bodyToken;
  }

  const cookieToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken;
  }

  return null;
}

function clearRefreshCookie(res) {
  const { maxAge, ...clearOptions } = refreshCookieConfig();
  void maxAge;
  res.clearCookie(REFRESH_COOKIE_NAME, clearOptions);
}

async function issueAuthPair({ userId, role, res }) {
  const accessToken = issueAccessToken({ id: userId, role, expiresIn: '15m' });
  const refreshIssued = issueRefreshToken({ userId });

  if (!refreshIssued.ok) {
    return { ok: false };
  }

  const stored = await storeRefreshSession({
    sessionId: refreshIssued.sessionId,
    userId,
    token: refreshIssued.token,
    expiresAt: refreshIssued.expiresAt,
  });

  if (!stored.ok) {
    return { ok: false };
  }

  res.cookie(REFRESH_COOKIE_NAME, refreshIssued.token, refreshCookieConfig());

  return {
    ok: true,
    accessToken,
    refreshToken: refreshIssued.token,
  };
}

router.post('/register', strictAuthRateLimiter, strictValidate(authSchemas.register), async (req, res, next) => {
  try {
    const id = crypto.randomUUID();
    const auth = await issueAuthPair({ userId: id, role: 'customer', res });

    if (!auth.ok) {
      return sendApiError(req, res, 500, 'INTERNAL_ERROR', 'Authentication service misconfigured');
    }

    return res.status(201).json({
      data: {
        id,
        email: req.body.email,
        role: 'customer',
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', strictAuthRateLimiter, strictValidate(authSchemas.login), async (req, res, next) => {
  try {
    const userId = '00000000-0000-0000-0000-000000000010';
    const auth = await issueAuthPair({ userId, role: 'customer', res });

    if (!auth.ok) {
      return sendApiError(req, res, 500, 'INTERNAL_ERROR', 'Authentication service misconfigured');
    }

    return res.status(200).json({
      data: {
        email: req.body.email,
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/forgot', strictAuthRateLimiter, strictValidate(authSchemas.forgot), (_req, res) => {
  return res.status(200).json({ data: { accepted: true } });
});

router.post('/reset', strictAuthRateLimiter, strictValidate(authSchemas.reset), (_req, res) => {
  return res.status(200).json({ data: { reset: true } });
});

router.post('/refresh', strictAuthRateLimiter, strictValidate(authSchemas.refresh), async (req, res, next) => {
  try {
    const refreshToken = readRefreshToken(req);
    const verification = verifyRefreshToken(refreshToken);

    if (!verification.ok && verification.reason === 'misconfigured') {
      return sendApiError(req, res, 500, 'INTERNAL_ERROR', 'Authentication service misconfigured');
    }

    if (!verification.ok) {
      return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Invalid refresh token');
    }

    const payload = verification.payload;
    const sessionCheck = await validateAndConsumeRefreshSession({
      sessionId: payload.sid,
      userId: payload.sub,
      token: refreshToken,
      minRefreshIntervalMs: Number(process.env.REFRESH_MIN_INTERVAL_MS || 750),
    });

    if (!sessionCheck.ok) {
      const status = sessionCheck.reason === 'flood' ? 429 : 401;
      const code = sessionCheck.reason === 'flood' ? 'RATE_LIMITED' : 'UNAUTHORIZED';
      const message = sessionCheck.reason === 'flood' ? 'Too many refresh attempts' : 'Invalid refresh token';
      return sendApiError(req, res, status, code, message);
    }

    const rotated = issueRefreshToken({ userId: payload.sub });
    if (!rotated.ok) {
      return sendApiError(req, res, 500, 'INTERNAL_ERROR', 'Authentication service misconfigured');
    }

    const rotation = await rotateRefreshSession({
      oldSessionId: payload.sid,
      newSessionId: rotated.sessionId,
      userId: payload.sub,
      newToken: rotated.token,
      newExpiresAt: rotated.expiresAt,
    });

    if (!rotation.ok) {
      return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Invalid refresh token');
    }

    const accessToken = issueAccessToken({ id: payload.sub, role: payload.role || 'customer', expiresIn: '15m' });
    res.cookie(REFRESH_COOKIE_NAME, rotated.token, refreshCookieConfig());

    return res.status(200).json({
      data: {
        refreshed: true,
        accessToken,
        refreshToken: rotated.token,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', strictValidate(authSchemas.logout), async (req, res, next) => {
  try {
    const refreshToken = readRefreshToken(req);
    clearRefreshCookie(res);

    if (!refreshToken) {
      return res.status(204).send();
    }

    const verification = verifyRefreshToken(refreshToken);
    if (!verification.ok) {
      return res.status(204).send();
    }

    await revokeRefreshSession(verification.payload.sid);

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;