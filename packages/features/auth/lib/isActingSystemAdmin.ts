import { UserPermissionRole } from "@calcom/prisma/enums";

type SessionLike = {
  user?: {
    impersonatedBy?: { id: number } | null;
  } | null;
} | null;

/**
 * Whether the caller may use instance-wide administrator powers outside of the admin routes.
 *
 * `role` must be the effective role (see `getEffectivePermissionRole`): the lowest of the role
 * validated at login and the database role, so a stale session never keeps admin powers. An admin
 * acting through an impersonated session has the target's identity, and must not get these powers
 * even if the target is an admin too, so the session itself is required to rule impersonation out.
 */
export function isActingSystemAdmin({
  role,
  session,
}: {
  role: string | null | undefined;
  session: SessionLike | undefined;
}): boolean {
  if (role !== UserPermissionRole.ADMIN) return false;
  if (!session?.user) return false;
  return !session.user.impersonatedBy;
}
