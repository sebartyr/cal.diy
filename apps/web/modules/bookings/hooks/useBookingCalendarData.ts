import dayjs from "@calcom/dayjs";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import { useMemo } from "react";
import { buildRecurringInfoMap, dedupeRecurringSeries } from "../lib/recurringBookings";
import type { BookingListingStatus, BookingsGetOutput, RowData } from "../types";

interface UseBookingCalendarDataParams {
  data?: {
    bookings: BookingsGetOutput["bookings"];
    recurringInfo: BookingsGetOutput["recurringInfo"];
    totalCount: BookingsGetOutput["totalCount"];
  };
  status: BookingListingStatus;
}

/**
 * Custom hook to transform raw booking data into RowData format for the calendar view
 * - Deduplicates recurring bookings for recurring/unconfirmed/cancelled tabs
 * - Attaches recurring info and isToday flag to each booking
 */
export function useBookingCalendarData({ data, status }: UseBookingCalendarDataParams) {
  const user = useMeQuery().data;

  const rowData = useMemo<RowData[]>(() => {
    if (!data?.bookings) {
      return [];
    }

    const recurringInfoMap = buildRecurringInfoMap(data.recurringInfo);
    const today = dayjs().tz(user?.timeZone).format("YYYY-MM-DD");

    return dedupeRecurringSeries(data.bookings, status).map((booking) => ({
      type: "data" as const,
      booking,
      isToday: dayjs(booking.startTime).tz(user?.timeZone).format("YYYY-MM-DD") === today,
      recurringInfo: booking.recurringEventId ? recurringInfoMap.get(booking.recurringEventId) : undefined,
    }));
  }, [data, status, user?.timeZone]);

  return rowData;
}
