import type { RouterInputs, RouterOutputs } from "@calcom/trpc/react";

export type BookingListingStatus = NonNullable<
  RouterInputs["viewer"]["bookings"]["get"]["filters"]["statuses"]
>[number];

type BookingItem = RouterOutputs["viewer"]["bookings"]["get"]["bookings"][number];

export type BookingItemProps = BookingItem & {
  listingStatus: BookingListingStatus;
  recurringInfo: RouterOutputs["viewer"]["bookings"]["get"]["recurringInfo"][number] | undefined;
  loggedInUser: {
    userId: number | undefined;
    userTimeZone: string | undefined;
    userTimeFormat: number | null | undefined;
    userEmail: string | undefined;
    // Acting system admins may act on other users' bookings as if they were their host.
    isSystemAdmin?: boolean;
  };
  isToday: boolean;
  onClick?: () => void;
};
