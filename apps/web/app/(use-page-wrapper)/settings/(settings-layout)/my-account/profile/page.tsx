import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { meRouter } from "@calcom/trpc/server/routers/viewer/me/_router";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { createRouterCaller } from "app/_trpc/context";
import { _generateMetadata } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import ProfileView from "~/settings/my-account/profile-view";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("profile"),
    (t) => t("profile_description"),
    undefined,
    undefined,
    "/settings/my-account/profile"
  );

const Page = async () => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) {
    redirect("/auth/login?callbackUrl=/settings/my-account/profile");
  }

  const meCaller = await createRouterCaller(meRouter);
  const user = await meCaller.get({ includePasswordAdded: true });
  if (!user) {
    redirect("/auth/login");
  }

  return <ProfileView user={user} />;
};

export default Page;
