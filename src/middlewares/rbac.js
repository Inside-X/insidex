import { normalizeRole } from '../security/rbac-policy.js';
import { sendApiError } from '../utils/api-error.js';

export function requireAuthenticatedSubject(req, res) {
  if (!req.auth?.sub) {
    sendApiError(req, res, 401, 'UNAUTHORIZED', 'Authentication required');
    return false;
  }

  return true;
}

export function getNormalizedAuthRole(req) {
  return normalizeRole(req.auth?.role);
}

export function hasCheckoutIdentityAccess(req) {
  const normalizedRole = getNormalizedAuthRole(req);
  const isGuest = req.auth?.isGuest;

  if (typeof isGuest !== 'boolean') {
    return false;
  }

  const isCustomerIdentity = normalizedRole === 'customer' && isGuest === false;
  const isGuestIdentity = normalizedRole === 'guest' && isGuest === true;
  return isCustomerIdentity || isGuestIdentity;
}

export default {
  requireAuthenticatedSubject,
  getNormalizedAuthRole,
  hasCheckoutIdentityAccess,
};