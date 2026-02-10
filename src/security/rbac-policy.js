export const ROLE_PERMISSIONS = Object.freeze({
  admin: Object.freeze([
    'admin:health:read',
    'reports:read',
    'audit-log:read',
  ]),
  ops: Object.freeze([
    'audit-log:read',
  ]),
  customer: Object.freeze([]),
});

export function normalizeRole(role) {
  if (typeof role !== 'string') {
    return null;
  }

  const normalizedRole = role.trim().toLowerCase();
  return normalizedRole || null;
}

export function getPermissionsForRole(role) {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    return [];
  }

  return ROLE_PERMISSIONS[normalizedRole] ?? [];
}

export function roleHasPermission(role, permission) {
  if (typeof permission !== 'string' || !permission.trim()) {
    return false;
  }

  const requiredPermission = permission.trim();
  return getPermissionsForRole(role).includes(requiredPermission);
}