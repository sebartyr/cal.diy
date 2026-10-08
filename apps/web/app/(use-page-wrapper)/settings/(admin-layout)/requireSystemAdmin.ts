import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { getUserRoleService } from "@calcom/features/users/di/UserRoleService.container";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Requires both an ADMIN role validated at login (the session role never exceeds it) and a current
 * ADMIN, unlocked account in the database: the session is cached per process, so a freshly demoted
 * admin would otherwise keep access, and a freshly promoted user must log in again so the admin
 * password/2FA policy runs. Pages that load sensitive data server-side must call this too, because
 * layouts are not re-rendered on client-side navigation.
 */
export async function requireSystemAdmin() {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) {
    return redirect("/auth/login");
  }

  if (session.user.role !== "ADMIN") {
    return redirect("/settings/my-account/profile");
  }

  const isAdmin = await getUserRoleService().isActiveSystemAdmin(session.user.id);
  if (!isAdmin) {
    return redirect("/settings/my-account/profile");
  }

  return session;
}
