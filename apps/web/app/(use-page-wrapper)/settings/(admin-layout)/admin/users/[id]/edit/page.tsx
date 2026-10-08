import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { prisma } from "@calcom/prisma";
import { UserPermissionRole } from "@calcom/prisma/enums";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import type { Params } from "app/_types";
import { _generateMetadata, getTranslate } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { UsersEditView } from "~/users/views/users-edit-view";

const userIdSchema = z.object({ id: z.coerce.number() });

// The admin layout redirects non-admins, but layouts and pages render in parallel in the
// App Router, so the page must not load user data before checking the role itself.
const isAdminSession = async () => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  return session?.user?.role === UserPermissionRole.ADMIN;
};

export const generateMetadata = async ({ params }: { params: Params }) => {
  const input = userIdSchema.safeParse(await params);
  if (!input.success || !(await isAdminSession())) {
    return await _generateMetadata(
      (t) => t("editing_user"),
      (t) => t("admin_users_edit_description"),
      undefined,
      undefined,
      "/settings/admin/users/edit"
    );
  }

  const userRepo = new UserRepository(prisma);
  const user = await userRepo.adminFindById(input.data.id);

  return await _generateMetadata(
    (t) => `${t("editing_user")}: ${user.username}`,
    (t) => t("admin_users_edit_description"),
    undefined,
    undefined,
    `/settings/admin/users/${input.data.id}/edit`
  );
};

const Page = async ({ params }: { params: Params }) => {
  if (!(await isAdminSession())) {
    redirect("/settings/my-account/profile");
  }

  const input = userIdSchema.safeParse(await params);

  if (!input.success) throw new Error("Invalid access");

  const userRepo = new UserRepository(prisma);
  const user = await userRepo.adminFindById(input.data.id);

  const t = await getTranslate();

  return (
    <SettingsHeader title={t("editing_user")} description={t("admin_users_edit_description")}>
      <UsersEditView user={user} />
    </SettingsHeader>
  );
};

export default Page;
