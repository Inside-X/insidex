import { sendApiError } from '../utils/api-error.js';
import { roleHasPermission } from '../security/rbac-policy.js';
import { getNormalizedAuthRole, requireAuthenticatedSubject } from './rbac.js';

/**
 * requirePermission('reports:read')
 * requirePermission(['reports:read', 'audit-log:read'])
 */
export function requirePermission(permissionOrArray) {
  const requiredPermissions = Array.isArray(permissionOrArray) ? permissionOrArray : [permissionOrArray];

  if (!requiredPermissions.length || requiredPermissions.some((p) => typeof p !== 'string' || !p.trim())) {
    throw new Error('requirePermission expects a non-empty permission string or array of non-empty permission strings');
  }

  const normalizedPermissions = requiredPermissions.map((p) => p.trim());

  return function requirePermissionMiddleware(req, res, next) {
    if (!requireAuthenticatedSubject(req, res)) {
      return undefined;
    }

    const normalizedRole = getNormalizedAuthRole(req);
    const hasAnyPermission = normalizedPermissions.some((permission) => roleHasPermission(normalizedRole, permission));

    if (!hasAnyPermission) {
      return sendApiError(req, res, 403, 'FORBIDDEN', 'Insufficient permissions');
    }

    return next();
  };
}

export default requirePermission;