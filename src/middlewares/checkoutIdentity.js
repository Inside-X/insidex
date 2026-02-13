import { sendApiError } from '../utils/api-error.js';
import { userRepository } from '../repositories/user.repository.js';
import { issueAccessToken } from '../security/access-token.js';

/**
 * Ensure a checkout JWT exists before authenticate middleware:
 * - if Authorization header is already present, keep it
 * - otherwise, create/resolve guest user and inject implicit Bearer token
 */
export async function ensureCheckoutSessionJWT(req, res, next) {
  if (req.get('authorization')) {
    return next();
  }

  const guest = req.body?.guest || { email: req.body?.email, address: req.body?.address };
  if (!guest?.email || !guest?.address) {
    return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Authentication required or guest checkout payload missing');
  }

  const guestUser = await userRepository.createGuest({
    email: guest.email,
    address: guest.address,
  });

  const guestToken = issueAccessToken({
    id: guestUser.id,
    role: 'customer',
    isGuest: true,
    // Reduce replay window for implicit checkout-only sessions.
    expiresIn: '10m',
  });

  // Make downstream authenticate middleware the single source of truth for req.auth.
  req.headers.authorization = `Bearer ${guestToken}`;
  res.locals.implicitGuestToken = guestToken;
  return next();
}

export default ensureCheckoutSessionJWT;