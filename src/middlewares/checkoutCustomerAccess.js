import { sendApiError } from '../utils/api-error.js';

/**
 * Checkout is restricted to CUSTOMER identities only.
 * Both permanent customers (isGuest=false) and guest customers (isGuest=true) are allowed.
 */
export function checkoutCustomerAccess(req, res, next) {
  if (!req.auth?.sub) {
    return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Authentication required');
  }

  if (req.auth.role !== 'customer') {
    return sendApiError(req, res, 403, 'FORBIDDEN', 'Insufficient permissions');
  }

  if (typeof req.auth.isGuest !== 'boolean') {
    return sendApiError(req, res, 403, 'FORBIDDEN', 'Invalid checkout identity');
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