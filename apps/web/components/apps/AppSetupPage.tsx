import { DynamicComponent } from "@calcom/app-store/_components/DynamicComponent";
import dynamic from "next/dynamic";

export const AppSetupMap = {
  "apple-calendar": dynamic(() => import("@calcom/web/components/apps/applecalendar/Setup")),
  exchange: dynamic(() => import("@calcom/web/components/apps/exchangecalendar/Setup")),
  "exchange2013-calendar": dynamic(() => import("@calcom/web/components/apps/exchange2013calendar/Setup")),
  "exchange2016-calendar": dynamic(() => import("@calcom/web/components/apps/exchange2016calendar/Setup")),
  "caldav-calendar": dynamic(() => import("@calcom/web/components/apps/caldavcalendar/Setup")),
  "ics-feed": dynamic(() => import("@calcom/web/components/apps/ics-feedcalendar/Setup")),
};

export const AppSetupPage = (props: { slug: string }) => {
  return <DynamicComponent<typeof AppSetupMap> componentMap={AppSetupMap} {...props} />;
};

export default AppSetupPage;
