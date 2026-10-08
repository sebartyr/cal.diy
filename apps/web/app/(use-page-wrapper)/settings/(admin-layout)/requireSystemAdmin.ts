import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { getUserRoleService } from "@calcom/features/users/di/UserRoleService.container";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * The role is re-read from the database rather than trusted from the session: the session is cached
 * per process and the JWT keeps the role it was issued with, so a freshly demoted admin would
 * otherwise keep access. Pages that load sensitive data server-side must call this too, because
 * layouts are not re-rendered on client-side navigation.
 */
export async function requireSystemAdmin() {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) {
    return redirect("/auth/login");
  }

  const isAdmin = await getUserRoleService().isActiveSystemAdmin(session.user.id);
  if (!isAdmin) {
    return redirect("/settings/my-account/profile");
  }

  return session;
}
