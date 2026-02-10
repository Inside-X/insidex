function unauthorized(res) {
  return res.status(401).json({
    error: {
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    },
  });
}

function forbidden(res) {
  return res.status(403).json({
    error: {
      code: 'FORBIDDEN',
      message: 'Insufficient permissions',
    },
  });
}

/**
 * authorizeRole('admin')
 * authorizeRole(['admin', 'ops'])
 *
 * Role policy:
 * - trims surrounding whitespace
 * - compares case-insensitively (lowercase normalization)
 */
export function authorizeRole(roleOrArray) {
  const allowedRoles = Array.isArray(roleOrArray) ? roleOrArray : [roleOrArray];

  if (!allowedRoles.length || allowedRoles.some((role) => typeof role !== 'string' || !role.trim())) {
    throw new Error('authorizeRole expects a non-empty role string or array of non-empty role strings');
  }

  const normalizeRole = (role) => role.trim().toLowerCase();
  const normalizedAllowedRoles = new Set(allowedRoles.map(normalizeRole));

  return function authorizeRoleMiddleware(req, res, next) {
    const auth = req.auth;

    if (!auth?.sub) {
      return unauthorized(res);
    }

    const currentRole = auth.role;
    const normalizedCurrentRole = typeof currentRole === 'string' ? normalizeRole(currentRole) : null;

    if (!normalizedCurrentRole || !normalizedAllowedRoles.has(normalizedCurrentRole)) {
      return forbidden(res);
    }

    return next();
  };
}

export default authorizeRole;