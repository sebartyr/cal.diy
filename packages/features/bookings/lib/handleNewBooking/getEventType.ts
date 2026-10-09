import { getDefaultEvent } from "@calcom/features/eventtypes/lib/defaultEvents";
import { HttpError } from "@calcom/lib/http-error";
import { withReporting } from "@calcom/lib/sentryWrapper";
import { getBookingFieldsWithSystemFields } from "../getBookingFields";
import { getEventTypesFromDB } from "./getEventTypesFromDB";

const _getEventType = async ({
  eventTypeId,
  eventTypeSlug,
}: {
  eventTypeId: number;
  eventTypeSlug?: string;
}) => {
  if (!eventTypeId && !eventTypeSlug) {
    throw new HttpError({ statusCode: 400, message: "Either eventTypeId or eventTypeSlug must be provided" });
  }

  // getEventTypesFromDB already returns bookingFields with system fields, only the dynamic event needs them added
  if (eventTypeId || !eventTypeSlug) {
    return getEventTypesFromDB(eventTypeId);
  }

  // A dynamic event never has a team, so it is never an org team event
  const eventType = getDefaultEvent(eventTypeSlug);

  return {
    ...eventType,
    bookingFields: getBookingFieldsWithSystemFields({ ...eventType, isOrgTeamEvent: false }),
  };
};

export const getEventType = withReporting(_getEventType, "getEventType");
