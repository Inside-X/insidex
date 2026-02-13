import crypto from 'crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { validate } from '../validation/validate.middleware.js';
import { authSchemas } from '../validation/schemas/index.js';
import { strictAuthRateLimiter } from '../middlewares/rateLimit.js';
import { sendApiError } from '../utils/api-error.js';

const router = express.Router();

function issueAccessToken({ id, role }) {
  return jwt.sign(
    { sub: id, role },
    process.env.JWT_ACCESS_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '15m',
      issuer: process.env.JWT_ACCESS_ISSUER,
      audience: process.env.JWT_ACCESS_AUDIENCE,
    }
  );
}

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

router.post('/register', strictAuthRateLimiter, validate(authSchemas.register), (req, res) => {
  const id = crypto.randomUUID();
  const token = issueAccessToken({ id, role: req.body.role });
  return res.status(201).json({ data: { id, email: req.body.email, role: req.body.role, accessToken: token } });
});

router.post('/login', strictAuthRateLimiter, validate(authSchemas.login), (req, res) => {
  const token = issueAccessToken({ id: '00000000-0000-0000-0000-000000000010', role: 'customer' });
  return res.status(200).json({ data: { email: req.body.email, accessToken: token } });
});

router.post('/forgot', strictAuthRateLimiter, validate(authSchemas.forgot), (_req, res) => res.status(200).json({ data: { accepted: true } }));
router.post('/reset', strictAuthRateLimiter, validate(authSchemas.reset), (_req, res) => res.status(200).json({ data: { reset: true } }));
router.post('/refresh', strictAuthRateLimiter, validate(authSchemas.refresh), (req, res) => {
  const result = verifyRefreshToken(req.body.refreshToken);

  if (!result.ok && result.reason === 'misconfigured') {
    return sendApiError(req, res, 500, 'INTERNAL_ERROR', 'Authentication service misconfigured');
  }

  if (!result.ok) {
    return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Invalid refresh token');
  }

  return res.status(200).json({ data: { refreshed: true } });
});
router.post('/logout', validate(authSchemas.logout), (_req, res) => res.status(200).json({ data: { loggedOut: true } }));

export default router;