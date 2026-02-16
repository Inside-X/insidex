import { sendApiError } from '../utils/api-error.js';
import { getNormalizedAuthRole, requireAuthenticatedSubject } from './rbac.js';

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

  const normalizedAllowedRoles = new Set(allowedRoles.map((role) => role.trim().toLowerCase()));

  return function authorizeRoleMiddleware(req, res, next) {
    if (!requireAuthenticatedSubject(req, res)) {
      return undefined;
    }

    const normalizedCurrentRole = getNormalizedAuthRole(req);

    if (!normalizedCurrentRole || !normalizedAllowedRoles.has(normalizedCurrentRole)) {
      return sendApiError(req, res, 403, 'FORBIDDEN', 'Insufficient permissions');
    }

    return next();
  };
}

export default authorizeRole;