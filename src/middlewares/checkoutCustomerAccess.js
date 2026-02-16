import { hasCheckoutIdentityAccess, requireAuthenticatedSubject } from './rbac.js';
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
  if (!requireAuthenticatedSubject(req, res)) {
    return undefined;
  }

  if (!hasCheckoutIdentityAccess(req)) {
    return sendApiError(req, res, 403, 'FORBIDDEN', 'Insufficient permissions');
  }
  
  return next();
}

/**
 * Prevent user impersonation via payload userId.
 */
export function enforceOrderOwnership(req, res, next) {
  if (!requireAuthenticatedSubject(req, res)) {
    return undefined;
  }

  if (Object.hasOwn(req.body || {}, 'userId')) {
    return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'userId must not be provided');
  }

  return next();
}

export default checkoutCustomerAccess;