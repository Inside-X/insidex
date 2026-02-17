import express from 'express';
import { strictValidate } from '../validation/strict-validate.middleware.js';
import { authSchemas } from '../validation/schemas/index.js';
import { strictAuthRateLimiter } from '../middlewares/rateLimit.js';
import { sendApiError } from '../utils/api-error.js';
import { issueAccessToken } from '../security/access-token.js';
import { issueRefreshToken } from '../security/refresh-token.js';
import { verifyRefreshToken } from '../security/token-verifier.js';
import { userRepository } from '../repositories/user.repository.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import { sendConfirmationEmail } from '../lib/email.js';
import authenticateJWT from '../middlewares/authenticate.js';
import { clearAuthCookies, readCookie, setAuthCookies, authCookieNames } from '../security/auth-cookies.js';

const router = express.Router();

function buildUserPayload(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isGuest: user.isGuest === true,
  };
}

function issueTokenPair(user) {
  const accessToken = issueAccessToken({ id: user.id, role: user.role, isGuest: user.isGuest === true });
  const refreshToken = issueRefreshToken({ id: user.id, role: user.role, isGuest: user.isGuest === true });
  return { accessToken, refreshToken };
}

router.post('/register', strictAuthRateLimiter, strictValidate(authSchemas.register), async (req, res, next) => {
  try {
    const existing = await userRepository.findByEmail(req.body.email);
    if (existing) {
      return sendApiError(req, res, 409, 'CONFLICT', 'Email already in use');
    }

    const passwordHash = await hashPassword(req.body.password);
    const createdUser = await userRepository.create({
      email: req.body.email,
      passwordHash,
      role: req.body.role,
      isGuest: false,
    });

    await sendConfirmationEmail({ userId: createdUser.id, email: createdUser.email });

    const tokens = issueTokenPair(createdUser);
    setAuthCookies(res, tokens);

    return res.status(201).json({ data: { user: buildUserPayload(createdUser) } });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', strictAuthRateLimiter, strictValidate(authSchemas.login), async (req, res, next) => {
  try {
    const user = await userRepository.findByEmail(req.body.email);
    if (!user || !user.passwordHash || user.isGuest === true) {
      return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Invalid credentials');
    }

    const validPassword = await verifyPassword(req.body.password, user.passwordHash);
    if (!validPassword) {
      return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Invalid credentials');
    }

    const tokens = issueTokenPair(user);
    setAuthCookies(res, tokens);

    return res.status(200).json({ data: { user: buildUserPayload(user) } });
  } catch (error) {
    return next(error);
  }
});

router.post('/forgot', strictAuthRateLimiter, strictValidate(authSchemas.forgot), (_req, res) => res.status(200).json({ data: { accepted: true } }));
router.post('/reset', strictAuthRateLimiter, strictValidate(authSchemas.reset), (_req, res) => res.status(200).json({ data: { reset: true } }));
router.post('/refresh', strictAuthRateLimiter, strictValidate(authSchemas.refresh), async (req, res, next) => {
  try {
    const cookieRefreshToken = readCookie(req, authCookieNames.REFRESH_COOKIE);
    const providedRefreshToken = req.body?.refreshToken || cookieRefreshToken;

    if (!providedRefreshToken) {
      return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Invalid refresh token');
    }

    const result = verifyRefreshToken(providedRefreshToken);

    if (!result.ok && result.reason === 'misconfigured') {
      return sendApiError(req, res, 500, 'INTERNAL_ERROR', 'Authentication service misconfigured');
    }

    if (!result.ok) {
      return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Invalid refresh token');
    }

    const subject = result.payload?.sub;
    if (!subject) {
      return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Invalid refresh token');
    }

    const user = await userRepository.findById(subject);
    if (!user) {
      return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Invalid refresh token');
    }

    const tokens = issueTokenPair(user);
    setAuthCookies(res, tokens);

    return res.status(200).json({ data: { user: buildUserPayload(user) } });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', strictValidate(authSchemas.logout), (req, res) => {
  clearAuthCookies(res);
  return res.status(200).json({ data: { loggedOut: true } });
});

router.get('/me', authenticateJWT, async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.auth.sub);
    if (!user) {
      return sendApiError(req, res, 404, 'NOT_FOUND', 'User not found');
    }

    return res.status(200).json({ user: buildUserPayload(user) });
  } catch (error) {
    return next(error);
  }
});

export default router;