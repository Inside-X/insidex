import crypto from 'crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { strictValidate } from '../validation/strict-validate.middleware.js';
import { authSchemas } from '../validation/schemas/index.js';
import { strictAuthRateLimiter } from '../middlewares/rateLimit.js';
import { sendApiError } from '../utils/api-error.js';
import { issueAccessToken } from '../security/access-token.js';

const router = express.Router();

function verifyRefreshToken(refreshToken) {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_ACCESS_SECRET;
  const issuer = process.env.JWT_REFRESH_ISSUER || process.env.JWT_ACCESS_ISSUER;
  const audience = process.env.JWT_REFRESH_AUDIENCE || process.env.JWT_ACCESS_AUDIENCE;

  if (!secret || !issuer || !audience) {
    return { ok: false, reason: 'misconfigured' };
  }

  try {
    const decoded = jwt.verify(refreshToken, secret, {
      algorithms: ['HS256'],
      issuer,
      audience,
    });

    if (!decoded?.sub) {
      return { ok: false, reason: 'invalid' };
    }

    return { ok: true, payload: decoded };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

router.post('/register', strictAuthRateLimiter, strictValidate(authSchemas.register), (req, res) => {
  const id = crypto.randomUUID();
  const token = issueAccessToken({ id, role: req.body.role });
  return res.status(201).json({ data: { id, email: req.body.email, role: req.body.role, accessToken: token } });
});

router.post('/login', strictAuthRateLimiter, strictValidate(authSchemas.login), (req, res) => {
  const token = issueAccessToken({ id: '00000000-0000-0000-0000-000000000010', role: 'customer' });
  return res.status(200).json({ data: { email: req.body.email, accessToken: token } });
});

router.post('/forgot', strictAuthRateLimiter, strictValidate(authSchemas.forgot), (_req, res) => res.status(200).json({ data: { accepted: true } }));
router.post('/reset', strictAuthRateLimiter, strictValidate(authSchemas.reset), (_req, res) => res.status(200).json({ data: { reset: true } }));
router.post('/refresh', strictAuthRateLimiter, strictValidate(authSchemas.refresh), (req, res) => {
  const result = verifyRefreshToken(req.body.refreshToken);

  if (!result.ok && result.reason === 'misconfigured') {
    return sendApiError(req, res, 500, 'INTERNAL_ERROR', 'Authentication service misconfigured');
  }

  if (!result.ok) {
    return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Invalid refresh token');
  }

  return res.status(200).json({ data: { refreshed: true } });
});
router.post('/logout', strictValidate(authSchemas.logout), (_req, res) => res.status(200).json({ data: { loggedOut: true } }));

export default router;