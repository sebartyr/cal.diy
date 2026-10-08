import type { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { UserPermissionRole } from "@calcom/prisma/enums";
import { isActingSystemAdmin } from "./isActingSystemAdmin";

type SessionLike = {
  user?: {
    id?: number;
    role?: string | null;
    impersonatedBy?: { id: number } | null;
  } | null;
} | null;

/**
 * `isActingSystemAdmin` for entry points that only have a next-auth session (API routes, pages).
 * The session carries the effective role but not the 2FA state, so the account is loaded to apply
 * the whole admin policy. Non-admin sessions never hit the database.
 */
export async function isSessionActingSystemAdmin(
  session: SessionLike | undefined,
  userRepository: Pick<UserRepository, "findAuthIdentityById">
): Promise<boolean> {
  const sessionUser = session?.user;
  if (!sessionUser?.id || sessionUser.impersonatedBy) return false;
  if (sessionUser.role !== UserPermissionRole.ADMIN) return false;

  const account = await userRepository.findAuthIdentityById({ id: sessionUser.id });
  if (!account) return false;

  return isActingSystemAdmin({
    user: { role: sessionUser.role, twoFactorEnabled: account.twoFactorEnabled, locked: account.locked },
    session,
  });
}
