import {
  ROLE_PERMISSIONS,
  getPermissionsForRole,
  normalizeRole,
  roleHasPermission,
} from '../../src/security/rbac-policy.js';

describe('rbac-policy', () => {
  test('validates every role is present with exact permission mapping and immutable', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(['admin', 'customer', 'ops']);

    expect(ROLE_PERMISSIONS.admin).toEqual([
      'admin:health:read',
      'reports:read',
      'audit-log:read',
    ]);
    expect(ROLE_PERMISSIONS.ops).toEqual(['audit-log:read']);
    expect(ROLE_PERMISSIONS.customer).toEqual([]);

    expect(Object.isFrozen(ROLE_PERMISSIONS)).toBe(true);
    expect(Object.isFrozen(ROLE_PERMISSIONS.admin)).toBe(true);
    expect(Object.isFrozen(ROLE_PERMISSIONS.ops)).toBe(true);
    expect(Object.isFrozen(ROLE_PERMISSIONS.customer)).toBe(true);
  });

  test('normalizeRole handles valid strings, casing, whitespace, and empty values', () => {
    expect(normalizeRole('admin')).toBe('admin');
    expect(normalizeRole(' ADMIN ')).toBe('admin');
    expect(normalizeRole('  ops\n')).toBe('ops');
    expect(normalizeRole('customer\t')).toBe('customer');

    expect(normalizeRole('')).toBeNull();
    expect(normalizeRole('   ')).toBeNull();
  });

  test('normalizeRole returns null for non-string role values (undefined/null/objects)', () => {
    expect(normalizeRole(undefined)).toBeNull();
    expect(normalizeRole(null)).toBeNull();
    expect(normalizeRole(0)).toBeNull();
    expect(normalizeRole(false)).toBeNull();
    expect(normalizeRole({ role: 'admin' })).toBeNull();
    expect(normalizeRole(['admin'])).toBeNull();
  });

  test('getPermissionsForRole returns permissions for every defined role', () => {
    expect(getPermissionsForRole('admin')).toEqual(ROLE_PERMISSIONS.admin);
    expect(getPermissionsForRole('ops')).toEqual(ROLE_PERMISSIONS.ops);
    expect(getPermissionsForRole('customer')).toEqual(ROLE_PERMISSIONS.customer);
  });

  test('getPermissionsForRole supports normalized access (trim/case) and fallback behavior', () => {
    expect(getPermissionsForRole(' ADMIN ')).toEqual(ROLE_PERMISSIONS.admin);
    expect(getPermissionsForRole('OpS')).toEqual(ROLE_PERMISSIONS.ops);

    expect(getPermissionsForRole('unknown-role')).toEqual([]);
    expect(getPermissionsForRole('')).toEqual([]);
    expect(getPermissionsForRole('   ')).toEqual([]);
    expect(getPermissionsForRole(undefined)).toEqual([]);
    expect(getPermissionsForRole(null)).toEqual([]);
  });

  test('validates every permission has explicit allow path for intended roles', () => {
    const allPermissions = new Set(Object.values(ROLE_PERMISSIONS).flat());

    for (const permission of allPermissions) {
      const allowedRoles = Object.entries(ROLE_PERMISSIONS)
        .filter(([, perms]) => perms.includes(permission))
        .map(([role]) => role);

      expect(allowedRoles.length).toBeGreaterThan(0);
      for (const role of allowedRoles) {
        expect(roleHasPermission(role, permission)).toBe(true);
      }
    }
  });

  test('test allowed access for known role-permission pairs', () => {
    expect(roleHasPermission('admin', 'admin:health:read')).toBe(true);
    expect(roleHasPermission('admin', 'reports:read')).toBe(true);
    expect(roleHasPermission('admin', 'audit-log:read')).toBe(true);
    expect(roleHasPermission('ops', 'audit-log:read')).toBe(true);
  });

  test('test denied access for known non-authorized role-permission pairs (no silent allow)', () => {
    expect(roleHasPermission('ops', 'admin:health:read')).toBe(false);
    expect(roleHasPermission('ops', 'reports:read')).toBe(false);
    expect(roleHasPermission('customer', 'audit-log:read')).toBe(false);
    expect(roleHasPermission('customer', 'reports:read')).toBe(false);
    expect(roleHasPermission('customer', 'admin:health:read')).toBe(false);
  });

  test('undefined role or unknown role always denies access', () => {
    expect(roleHasPermission(undefined, 'reports:read')).toBe(false);
    expect(roleHasPermission(null, 'reports:read')).toBe(false);
    expect(roleHasPermission('   ', 'reports:read')).toBe(false);
    expect(roleHasPermission('nonexistent', 'reports:read')).toBe(false);
  });

  test('undefined/invalid permission always denies access', () => {
    expect(roleHasPermission('admin', undefined)).toBe(false);
    expect(roleHasPermission('admin', null)).toBe(false);
    expect(roleHasPermission('admin', '')).toBe(false);
    expect(roleHasPermission('admin', '   ')).toBe(false);
    expect(roleHasPermission('admin', 123)).toBe(false);
    expect(roleHasPermission('admin', {})).toBe(false);
  });

  test('permission matching requires exact trimmed string and does not auto-normalize case', () => {
    expect(roleHasPermission('admin', ' reports:read ')).toBe(true);
    expect(roleHasPermission('admin', 'Reports:Read')).toBe(false);
    expect(roleHasPermission('admin', 'AUDIT-LOG:READ')).toBe(false);
  });

  test('fallback behavior never grants permission when role or permission is unknown', () => {
    expect(roleHasPermission('unknown', 'unknown:permission')).toBe(false);
    expect(roleHasPermission('admin', 'unknown:permission')).toBe(false);
    expect(roleHasPermission('unknown', 'reports:read')).toBe(false);
  });
});