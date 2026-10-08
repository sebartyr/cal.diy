import { UserPermissionRole } from "@calcom/prisma/enums";

export type SessionRole = UserPermissionRole | "INACTIVE_ADMIN";

/**
 * Combines the role validated when the user authenticated (stored in the JWT) with the current
 * database role, keeping the lowest of the two.
 *
 * Demotions apply immediately. Promotions, and INACTIVE_ADMIN -> ADMIN, only apply after a fresh
 * login: the admin password/2FA policy (`validateRole`) runs at authentication time only, so a
 * session must never be elevated from the database alone.
 */
export function getEffectiveSessionRole(
  authenticatedRole: SessionRole | null | undefined,
  dbRole: UserPermissionRole
): SessionRole {
  if (dbRole !== UserPermissionRole.ADMIN) return dbRole;
  if (authenticatedRole === UserPermissionRole.ADMIN || authenticatedRole === "INACTIVE_ADMIN") {
    return authenticatedRole;
  }
  return UserPermissionRole.USER;
}

/** Same as `getEffectiveSessionRole`, folded onto the database enum for server-side permission checks. */
export function getEffectivePermissionRole(
  authenticatedRole: SessionRole | null | undefined,
  dbRole: UserPermissionRole
): UserPermissionRole {
  const role = getEffectiveSessionRole(authenticatedRole, dbRole);
  return role === "INACTIVE_ADMIN" ? UserPermissionRole.USER : role;
}
