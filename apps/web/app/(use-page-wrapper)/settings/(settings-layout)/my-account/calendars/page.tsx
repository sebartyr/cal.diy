import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { appsRouter } from "@calcom/trpc/server/routers/viewer/apps/_router";
import { calendarsRouter } from "@calcom/trpc/server/routers/viewer/calendars/_router";
import { CalendarListContainer } from "@components/apps/CalendarListContainer";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { createRouterCaller, getTRPCContext } from "app/_trpc/context";
import { _generateMetadata } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("calendars"),
    (t) => t("calendars_description"),
    undefined,
    undefined,
    "/settings/my-account/calendars"
  );

const Page = async () => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) {
    redirect("/auth/login?callbackUrl=/settings/my-account/calendars");
  }

  const trpcContext = await getTRPCContext();
  const [calendarsCaller, appsCaller] = await Promise.all([
    createRouterCaller(calendarsRouter, trpcContext),
    createRouterCaller(appsRouter, trpcContext),
  ]);

  const [connectedCalendars, installedCalendars] = await Promise.all([
    calendarsCaller.connectedCalendars(),
    appsCaller.integrations({
      variant: "calendar",
      onlyInstalled: true,
    }),
  ]);
  return (
    <CalendarListContainer connectedCalendars={connectedCalendars} installedCalendars={installedCalendars} />
  );
};

export default Page;
