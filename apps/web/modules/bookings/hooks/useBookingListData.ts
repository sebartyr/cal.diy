import dayjs from "@calcom/dayjs";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { useMemo } from "react";
import { buildRecurringInfoMap, dedupeRecurringSeries } from "../lib/recurringBookings";
import type {
  BookingListingStatus,
  BookingOutput,
  BookingRowData,
  BookingsGetOutput,
  RowData,
} from "../types";

/**
 * Transform raw bookings into final data structure with separators
 * - Deduplicates recurring bookings for recurring/unconfirmed/cancelled tabs
 * - For "upcoming" status, organizes into "Today" and "Next" sections
 */
export function useBookingListData({
  data,
  status,
  userTimeZone,
}: {
  data?: BookingsGetOutput;
  status: BookingListingStatus;
  userTimeZone?: string;
}) {
  const { t } = useLocale();

  const recurringInfoMap = useMemo(() => buildRecurringInfoMap(data?.recurringInfo), [data?.recurringInfo]);

  /**
   * Transform raw bookings into flat list (excluding today's bookings for "upcoming" status)
   * - Deduplicates recurring bookings for recurring/unconfirmed/cancelled tabs
   * - For "upcoming" status, filters out today's bookings (they're shown in separate "Today" section)
   */
  const flatData = useMemo<BookingRowData[]>(() => {
    const bookings = data?.bookings ?? [];
    let visibleBookings: BookingOutput[];
    if (status === "upcoming") {
      const todayDateString = dayjs().tz(userTimeZone).format("YYYY-MM-DD");
      visibleBookings = bookings.filter(
        (booking) => dayjs(booking.startTime).tz(userTimeZone).format("YYYY-MM-DD") !== todayDateString
      );
    } else {
      visibleBookings = dedupeRecurringSeries(bookings, status);
    }

    return visibleBookings.map((booking) => ({
      type: "data" as const,
      booking,
      recurringInfo: booking.recurringEventId ? recurringInfoMap.get(booking.recurringEventId) : undefined,
      isToday: false,
    }));
  }, [data?.bookings, recurringInfoMap, status, userTimeZone]);

  // Extract today's bookings for the "Today" section (only used in "upcoming" status)
  const bookingsToday = useMemo<BookingRowData[]>(() => {
    const todayDateString = dayjs().tz(userTimeZone).format("YYYY-MM-DD");

    return (data?.bookings ?? [])
      .filter(
        (booking: BookingOutput) =>
          dayjs(booking.startTime).tz(userTimeZone).format("YYYY-MM-DD") === todayDateString
      )
      .map((booking) => ({
        type: "data" as const,
        booking,
        recurringInfo: booking.recurringEventId ? recurringInfoMap.get(booking.recurringEventId) : undefined,
        isToday: true,
      }));
  }, [data?.bookings, recurringInfoMap, userTimeZone]);

  // Combine data with section separators for "upcoming" tab
  const finalData = useMemo<RowData[]>(() => {
    // For other statuses, just return the flat list
    if (status !== "upcoming") {
      return flatData;
    }

    // For "upcoming" status, organize into "Today" and "Next" sections
    const merged: RowData[] = [];
    if (bookingsToday.length > 0) {
      merged.push({ type: "separator" as const, label: t("today") }, ...bookingsToday);
    }
    if (flatData.length > 0) {
      merged.push({ type: "separator" as const, label: t("next") }, ...flatData);
    }
    return merged;
  }, [bookingsToday, flatData, status, t]);

  return finalData;
}
