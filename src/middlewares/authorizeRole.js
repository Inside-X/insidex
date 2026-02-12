import { sendApiError } from '../utils/api-error.js';
import { normalizeRole as normalizeRbacRole } from '../security/rbac-policy.js';

/**
 * authorizeRole('admin')
 * authorizeRole(['admin', 'ops'])
 * Role policy:
 * - trims surrounding whitespace
 * - compares case-insensitively (lowercase normalization)
 */
export function authorizeRole(roleOrArray) {
  const allowedRoles = Array.isArray(roleOrArray) ? roleOrArray : [roleOrArray];

  if (!allowedRoles.length || allowedRoles.some((role) => typeof role !== 'string' || !role.trim())) {
    throw new Error('authorizeRole expects a non-empty role string or array of non-empty role strings');
  }

  const normalizedAllowedRoles = new Set(allowedRoles.map((role) => normalizeRbacRole(role)));

  return function authorizeRoleMiddleware(req, res, next) {
    if (!req.auth?.sub) {
      return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Authentication required');
    }

    const normalizedCurrentRole = normalizeRbacRole(req.auth.role);

    if (!normalizedCurrentRole || !normalizedAllowedRoles.has(normalizedCurrentRole)) {
      return sendApiError(req, res, 403, 'FORBIDDEN', 'Insufficient permissions');
    }

    return next();
  };
}

export default authorizeRole;