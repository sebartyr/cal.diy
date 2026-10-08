import { meetsSystemAdminPolicy, type SystemAdminCandidate } from "./systemAdminPolicy";

type SessionLike = {
  user?: {
    impersonatedBy?: { id: number } | null;
  } | null;
} | null;

/**
 * Whether the caller may use instance-wide administrator powers outside of the admin routes.
 *
 * `user.role` must be the effective role (see `getEffectivePermissionRole`): the lowest of the role
 * validated at login and the database role, so a stale session never keeps admin powers. The account
 * must also meet the admin policy (unlocked, 2FA when REQUIRE_2FA_FOR_ADMIN is on), exactly like the
 * admin routes. An admin acting through an impersonated session has the target's identity, and must
 * not get these powers even if the target is an admin too, so the session itself is required to rule
 * impersonation out.
 */
export function isActingSystemAdmin({
  user,
  session,
}: {
  user: SystemAdminCandidate;
  session: SessionLike | undefined;
}): boolean {
  if (!session?.user) return false;
  if (session.user.impersonatedBy) return false;
  return meetsSystemAdminPolicy(user);
}
