import { roleHasPermission } from '../security/rbac-policy.js';
import { sendApiError } from '../utils/api-error.js';

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
    if (!req.auth?.sub) {
      return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Authentication required');
    }

    const hasAnyPermission = normalizedPermissions.some((permission) => roleHasPermission(req.auth.role, permission));

    if (!hasAnyPermission) {
      return sendApiError(req, res, 403, 'FORBIDDEN', 'Insufficient permissions');
    }

    return next();
  };
}

export default requirePermission;