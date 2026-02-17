import crypto from 'crypto';
import express from 'express';
import { strictValidate } from '../validation/strict-validate.middleware.js';
import { authSchemas } from '../validation/schemas/index.js';
import { strictAuthRateLimiter } from '../middlewares/rateLimit.js';
import { sendApiError } from '../utils/api-error.js';
import { issueAccessToken } from '../security/access-token.js';
import { verifyRefreshToken } from '../security/token-verifier.js';

const router = express.Router();

router.post('/register', strictAuthRateLimiter, strictValidate(authSchemas.register), (req, res) => {
  const id = crypto.randomUUID();
  const role = 'customer';
  const token = issueAccessToken({ id, role });
  return res.status(201).json({ data: { id, email: req.body.email, role, accessToken: token } });
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