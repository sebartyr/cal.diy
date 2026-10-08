import { type SegmentIdentifier, SYSTEM_SEGMENT_PREFIX } from "@calcom/features/data-table/lib/types";

/**
 * Number of months to look ahead/behind when probing for nearest bookings
 * in calendar view navigation. This determines how far the navigation
 * probe queries will search for bookings.
 */
export const NAVIGATION_PROBE_WINDOW_MONTHS = 3;

export const MY_BOOKINGS_SEGMENT_ID = "my_bookings";
export const ALL_BOOKINGS_SEGMENT_ID = "all_bookings";

export const MY_BOOKINGS_SEGMENT: SegmentIdentifier = {
  id: `${SYSTEM_SEGMENT_PREFIX}${MY_BOOKINGS_SEGMENT_ID}`,
  type: "system",
};

export function isAllBookingsSegment(segmentId: SegmentIdentifier | null | undefined): boolean {
  return segmentId?.id === `${SYSTEM_SEGMENT_PREFIX}${ALL_BOOKINGS_SEGMENT_ID}`;
}
