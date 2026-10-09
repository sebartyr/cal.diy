import { HttpError } from "@calcom/lib/http-error";
import type { BookingSeat } from "../handleSeats/types";
import { isWithinMinimumRescheduleNotice } from "../reschedule/isWithinMinimumRescheduleNotice";
import { getSeatedBooking } from "./getSeatedBooking";
import type { OriginalRescheduledBooking } from "./originalRescheduledBookingUtils";
import { getOriginalRescheduledBooking } from "./originalRescheduledBookingUtils";

export type RescheduleLookup = {
  rescheduleUid: string;
  bookingSeat: BookingSeat | null;
  originalRescheduledBooking: OriginalRescheduledBooking;
};

export async function validateRescheduleRestrictions({
  rescheduleUid,
  userId,
  eventType,
}: {
  rescheduleUid: string | null | undefined;
  userId: number | null;
  eventType: { seatsPerTimeSlot: number | null; minimumRescheduleNotice: number | null } | null;
}): Promise<RescheduleLookup | null> {
  if (!rescheduleUid || !eventType) {
    return null; // Not a reschedule, skip validation
  }

  const bookingSeat = rescheduleUid ? await getSeatedBooking(rescheduleUid) : null;
  const actualRescheduleUid = bookingSeat ? bookingSeat.booking.uid : rescheduleUid;
  const lookup: RescheduleLookup = { rescheduleUid, bookingSeat, originalRescheduledBooking: null };

  if (!actualRescheduleUid) {
    return lookup; // No valid reschedule UID
  }

  try {
    const originalRescheduledBooking = await getOriginalRescheduledBooking(
      actualRescheduleUid,
      !!eventType.seatsPerTimeSlot
    );
    lookup.originalRescheduledBooking = originalRescheduledBooking;

    // Check if user is the organizer
    const isUserOrganizer =
      userId && originalRescheduledBooking.userId && userId === originalRescheduledBooking.userId;

    // Check minimum reschedule notice (only for non-organizers)
    const { minimumRescheduleNotice } = originalRescheduledBooking.eventType || {};
    if (
      !isUserOrganizer &&
      isWithinMinimumRescheduleNotice(originalRescheduledBooking.startTime, minimumRescheduleNotice ?? null)
    ) {
      throw new HttpError({
        statusCode: 403,
        message: "Rescheduling is not allowed within the minimum notice period before the event",
      });
    }
  } catch (error) {
    // Re-throw HttpError (including our 403 validation error)
    if (error instanceof HttpError) {
      throw error;
    }
    // For other errors (like booking not found), let the service handle it later
    // We don't want to fail early validation for these cases
  }

  return lookup;
}
