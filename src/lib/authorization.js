/**
 * Centralized Authorization Engine
 * Enforces Role-Based Access Control (RBAC) and Multi-Tenant Cafe Isolation
 *
 * Conceptual Policy Chain:
 * Authenticated User -> Identity -> Role -> Cafe Association -> Resource Ownership -> Permission -> Allow/Deny
 */

import { logAuthEvent } from './auth.js';

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  CAFE_ADMIN: 'cafe_admin',
  STAFF: 'staff',
};

// Route protection matrix
const ROUTE_PERMISSIONS = [
  { prefix: '/admin', allowedRoles: [ROLES.SUPER_ADMIN] },
  { prefix: '/super-admin', allowedRoles: [ROLES.SUPER_ADMIN] },
  { prefix: '/cafe', allowedRoles: [ROLES.SUPER_ADMIN, ROLES.CAFE_ADMIN] },
  { prefix: '/staff', allowedRoles: [ROLES.SUPER_ADMIN, ROLES.CAFE_ADMIN, ROLES.STAFF] },
];

/**
 * Authorize Route Access
 * Returns: { allowed: boolean, reason: 'unauthenticated' | 'unauthorized' | null }
 */
export function authorizeRoute(path, user, profile) {
  // Find if path matches any protected prefix
  const matchingRule = ROUTE_PERMISSIONS.find(rule => path.startsWith(rule.prefix));

  if (!matchingRule) {
    // Public route (e.g. /, /login, /reset-password)
    return { allowed: true, reason: null };
  }

  // 1. Must be authenticated
  if (!user || !profile) {
    return { allowed: false, reason: 'unauthenticated' };
  }

  // 2. Check account status
  if (profile.account_status !== 'active') {
    return { allowed: false, reason: 'unauthorized', message: 'Account is not active' };
  }

  // 3. Verify role permission
  const userRole = profile.role;
  if (!matchingRule.allowedRoles.includes(userRole)) {
    // Log unauthorized route attempt for security auditing
    logAuthEvent('unauthorized_access_attempt', {
      attempted_path: path,
      user_role: userRole,
    });
    return { allowed: false, reason: 'unauthorized' };
  }

  return { allowed: true, reason: null };
}

/**
 * Multi-Tenant Cafe Isolation Check (IDOR Prevention)
 * Verifies whether the authenticated user is authorized to interact with a specific cafe resource.
 *
 * Rules:
 * - Super Admin: Has system-level access to any cafe.
 * - Cafe Admin & Staff: STRICTLY confined to their assigned cafe_id.
 * - Any cross-cafe mismatch is strictly REJECTED and logged.
 */
export function authorizeCafeResourceAccess({ profile, targetCafeId, action = 'view' }) {
  if (!profile) {
    return { allowed: false, reason: 'unauthenticated' };
  }

  const { role, cafe_id } = profile;

  // 1. Super Admin override
  if (role === ROLES.SUPER_ADMIN) {
    return { allowed: true, reason: null };
  }

  // 2. Target resource must match user's cafe_id
  if (!cafe_id || !targetCafeId || cafe_id !== targetCafeId) {
    logAuthEvent('unauthorized_access_attempt', {
      action,
      user_cafe: cafe_id || 'unassigned',
      target_cafe: targetCafeId || 'none',
      violation: 'cross_cafe_isolation_breach',
    });
    return {
      allowed: false,
      reason: 'unauthorized',
      message: 'Access denied: You do not have permission to access resources from this cafe.',
    };
  }

  return { allowed: true, reason: null };
}
