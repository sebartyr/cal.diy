import { isActingSystemAdmin } from "@calcom/features/auth/lib/isActingSystemAdmin";
import { getBookingAccessService } from "@calcom/features/di/containers/BookingAccessService";

export type BookingActor = {
  user: { id: number; role?: string | null };
  session?: { user?: { impersonatedBy?: { id: number } | null } | null } | null;
};

/**
 * Regular booking access (organizer, host, team or org admin), extended to acting system admins.
 * The admin case is only evaluated when the regular one fails, so it is audited only when the admin
 * steps outside of their own scope.
 */
export async function hasBookingAccessOrIsSystemAdmin({
  actor,
  bookingId,
  bookingUid,
  path,
  action,
}: {
  actor: BookingActor;
  bookingId?: number;
  bookingUid?: string;
  path: string;
  action: string;
}): Promise<boolean> {
  const bookingAccessService = getBookingAccessService();

  const hasRegularAccess = await bookingAccessService.doesUserIdHaveAccessToBooking({
    userId: actor.user.id,
    bookingId,
    bookingUid,
  });
  if (hasRegularAccess) return true;

  return bookingAccessService.doesSystemAdminHaveAccessToBooking({
    userId: actor.user.id,
    isSystemAdmin: isActingSystemAdmin({ role: actor.user.role, session: actor.session }),
    bookingId,
    bookingUid,
    path,
    action,
  });
}
