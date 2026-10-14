import type { eventTypeMetaDataSchemaWithTypedApps } from "@calcom/app-store/zod-utils";
import type { BookerEventForAppData } from "@calcom/features/bookings/types.server";
import type { z } from "zod";
import type { CommonAppData } from "./commonAppDataType";

export type EventTypeApps = NonNullable<
  NonNullable<z.infer<typeof eventTypeMetaDataSchemaWithTypedApps>>["apps"]
>;
export type EventTypeAppsList = keyof EventTypeApps;

export const getEventTypeAppData = <T extends EventTypeAppsList>(
  eventType: BookerEventForAppData,
  appId: T,
  forcedGet?: boolean
): EventTypeApps[T] | null => {
  const metadata = eventType.metadata;
  const appMetadata = metadata?.apps && metadata.apps[appId];
  if (appMetadata) {
    const app = appMetadata as CommonAppData;
    const allowDataGet = forcedGet ? true : app.enabled;
    return allowDataGet
      ? {
          ...appMetadata,
          // We should favor eventType's price and currency over appMetadata's price and currency
          price: eventType.price || app.price || null,
          currency: eventType.currency || app.currency || null,
          // trackingId is legacy way to store value for TRACKING_ID. So, we need to support both.
          TRACKING_ID: app.TRACKING_ID || app.trackingId || null,
          TRACKING_EVENT: app.trackingEvent || "Lead",
        }
      : null;
  }
  // The legacy branch for event types storing their price on the price/currency columns rather
  // than in metadata.apps served the stripe app only, which has been removed. No event type in
  // this deployment has a non-zero price.
  return null;
};
