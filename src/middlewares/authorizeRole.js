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

  return function authorizeRoleMiddleware(req, res, next) {
    const currentRole = req.user?.role;

    if (!currentRole || !allowedRoles.includes(currentRole)) {
      return forbidden(res);
    }

    return next();
  };
}

export default authorizeRole;