import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { appsRouter } from "@calcom/trpc/server/routers/viewer/apps/_router";
import { eventTypesRouter } from "@calcom/trpc/server/routers/viewer/eventTypes/_router";
import { ConferencingAppsViewWebWrapper } from "@calcom/web/modules/apps/components/ConferencingAppsViewWebWrapper";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { createRouterCaller, getTRPCContext } from "app/_trpc/context";
import { _generateMetadata } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("conferencing"),
    (t) => t("conferencing_description"),
    undefined,
    undefined,
    "/settings/my-account/conferencing"
  );

const Page = async () => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) {
    redirect("/auth/login?callbackUrl=/settings/my-account/conferencing");
  }

  const trpcContext = await getTRPCContext();
  const [appsCaller, eventTypesCaller] = await Promise.all([
    createRouterCaller(appsRouter, trpcContext),
    createRouterCaller(eventTypesRouter, trpcContext),
  ]);

  const [integrations, defaultConferencingApp, eventTypesQueryData] = await Promise.all([
    appsCaller.integrations({ variant: "conferencing", onlyInstalled: true }),
    appsCaller.getUsersDefaultConferencingApp(),
    eventTypesCaller.bulkEventFetch(),
  ]);

  return (
    <ConferencingAppsViewWebWrapper
      integrations={integrations}
      defaultConferencingApp={defaultConferencingApp}
      eventTypes={eventTypesQueryData?.eventTypes ?? []}
    />
  );
};

export default Page;
