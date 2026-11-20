import type { AppFlags } from "@calcom/features/flags/config";
import { trpc } from "@calcom/trpc/react";

const initialData: AppFlags = {
  emails: false,
  "email-verification": false,
  "disable-signup": false,
  "organizer-request-email-v2": false,
  "salesforce-crm-tasker": false,
  "restriction-schedule": false,
  "calendar-subscription-cache": false,
  "calendar-subscription-sync": false,
  "onboarding-v3": false,
  "booker-botid": false,
  "bookings-v3": false,
  "booking-audit": false,
  "sink-shortener": false,
};

export function useFlags(): Partial<AppFlags> {
  const query = trpc.viewer.features.map.useQuery();
  return query.data ?? initialData;
}
