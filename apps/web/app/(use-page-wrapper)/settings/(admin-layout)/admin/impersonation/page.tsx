import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { UserPermissionRole } from "@calcom/prisma/enums";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { _generateMetadata, getTranslate } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import ImpersonationView from "~/settings/admin/impersonation-view";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("admin"),
    (t) => t("impersonation"),
    undefined,
    undefined,
    "/settings/admin/impersonation"
  );

const Page = async () => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });

  if (!session) {
    redirect("/auth/login?callbackUrl=/settings/admin/impersonation");
  }

  if (session.user.role !== UserPermissionRole.ADMIN || session.user.impersonatedBy) {
    redirect("/settings/my-account/profile");
  }

  const t = await getTranslate();
  return (
    <SettingsHeader title={t("impersonation")} description={t("user_impersonation_heading")}>
      <ImpersonationView />
    </SettingsHeader>
  );
};

export default Page;
