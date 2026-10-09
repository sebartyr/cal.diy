import type { BookingListingStatus, BookingOutput } from "../types";

const SERIES_DEDUPED_STATUSES: ReadonlySet<BookingListingStatus> = new Set<BookingListingStatus>([
  "recurring",
  "unconfirmed",
  "cancelled",
]);

export function buildRecurringInfoMap<TInfo extends { recurringEventId: string | null }>(
  recurringInfo: readonly TInfo[] | undefined
): Map<string, TInfo> {
  const map = new Map<string, TInfo>();
  for (const info of recurringInfo ?? []) {
    if (info.recurringEventId) {
      map.set(info.recurringEventId, info);
    }
  }
  return map;
}

function isSeriesDedupedStatus(status: BookingListingStatus): boolean {
  return SERIES_DEDUPED_STATUSES.has(status);
}

/**
 * On the recurring, unconfirmed and cancelled tabs a recurring series is shown once, through its first
 * occurrence in the list, instead of once per occurrence.
 */
export function dedupeRecurringSeries<TBooking extends Pick<BookingOutput, "recurringEventId">>(
  bookings: readonly TBooking[],
  status: BookingListingStatus
): TBooking[] {
  if (!isSeriesDedupedStatus(status)) {
    return [...bookings];
  }
  const seenSeries = new Set<string>();
  return bookings.filter((booking) => {
    if (!booking.recurringEventId) {
      return true;
    }
    if (seenSeries.has(booking.recurringEventId)) {
      return false;
    }
    seenSeries.add(booking.recurringEventId);
    return true;
  });
}
