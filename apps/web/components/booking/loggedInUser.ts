import type { BookingItemProps } from "./types";

export type BookingLoggedInUser = BookingItemProps["loggedInUser"];

/**
 * Every place rendering booking actions (list rows, details sheet) builds the viewer through this
 * function, so that capabilities such as `isSystemAdmin` reach every action menu and dialog.
 */
export function buildBookingLoggedInUser({
  userId,
  userTimeZone,
  userTimeFormat,
  userEmail,
  isSystemAdmin = false,
}: {
  userId: number | undefined;
  userTimeZone: string | undefined;
  userTimeFormat: number | null | undefined;
  userEmail: string | undefined;
  isSystemAdmin?: boolean;
}): BookingLoggedInUser {
  return { userId, userTimeZone, userTimeFormat, userEmail, isSystemAdmin };
}

/**
 * Whether the viewer acts on the booking as its host. A system admin cancels on the host's behalf,
 * so the server applies the host rules to them (mandatory reason, no no-show fee): the dialogs must
 * match.
 */
export function isActingAsBookingHost(booking: {
  loggedInUser: Pick<BookingLoggedInUser, "userId" | "isSystemAdmin">;
  user: { id: number } | null;
}): boolean {
  if (booking.loggedInUser.isSystemAdmin) return true;
  return booking.loggedInUser.userId === booking.user?.id;
}
