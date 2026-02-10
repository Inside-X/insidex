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
 */
export function authorizeRole(roleOrArray) {
  const allowedRoles = Array.isArray(roleOrArray) ? roleOrArray : [roleOrArray];

  if (!allowedRoles.length || allowedRoles.some((role) => typeof role !== 'string' || !role.trim())) {
    throw new Error('authorizeRole expects a non-empty role string or array of non-empty role strings');
  }

  const normalizedAllowedRoles = new Set(allowedRoles.map((role) => role.trim()));

  return function authorizeRoleMiddleware(req, res, next) {
    const auth = req.auth;

    if (!auth?.sub) {
      return unauthorized(res);
    }

    const currentRole = auth.role;
    if (typeof currentRole !== 'string' || !normalizedAllowedRoles.has(currentRole)) {
      return forbidden(res);
    }

    return next();
  };
}

export default authorizeRole;