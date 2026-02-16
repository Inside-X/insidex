import { normalizeRole } from '../security/rbac-policy.js';
import { sendApiError } from '../utils/api-error.js';

/**
 * Checkout RBAC policy (single authorization layer for checkout routes).
 *
 * Access matrix:
 * - customer: allowed (standard checkout) when role === "customer" and isGuest === false
 * - guest: allowed (limited scope) when role === "guest" and isGuest === true
 * - admin: forbidden unless explicitly added by route policy
 * - anonymous: unauthorized (401)
 *
 * Notes:
 * - Claims are evaluated after JWT verification (authenticate middleware).
 * - Role values are normalized before comparison.
 * - Mixed/tampered claim pairs (e.g. role=guest + isGuest=false) are rejected.
 */
export function checkoutCustomerAccess(req, res, next) {
  if (!req.auth?.sub) {
    return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Authentication required');
  }

  const normalizedRole = normalizeRole(req.auth.role);
  const isGuest = req.auth.isGuest;

  if (typeof isGuest !== 'boolean') {
    return sendApiError(req, res, 403, 'FORBIDDEN', 'Invalid checkout identity');
  }

  const isCustomerIdentity = normalizedRole === 'customer' && isGuest === false;
  const isGuestIdentity = normalizedRole === 'guest' && isGuest === true;

  if (!isCustomerIdentity && !isGuestIdentity) {
    return sendApiError(req, res, 403, 'FORBIDDEN', 'Insufficient permissions');
  }
  
  return next();
}

/**
 * Prevent user impersonation via payload userId.
 */
export function enforceOrderOwnership(req, res, next) {
  if (!req.auth?.sub) {
    return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Authentication required');
  }

  if (req.body.userId && req.body.userId !== req.auth.sub) {
    return sendApiError(req, res, 403, 'FORBIDDEN', 'Cannot create order for another user');
  }

  return next();
}

export default checkoutCustomerAccess;