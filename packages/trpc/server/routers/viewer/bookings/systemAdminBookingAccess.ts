import { isActingSystemAdmin } from "@calcom/features/auth/lib/isActingSystemAdmin";
import { getBookingAccessService } from "@calcom/features/di/containers/BookingAccessService";

export type BookingActor = {
  // twoFactorEnabled is optional because callers without a session (magic links) never qualify;
  // when it is missing and the 2FA policy is on, the admin access is denied.
  user: { id: number; role?: string | null; twoFactorEnabled?: boolean | null; locked?: boolean | null };
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
    isSystemAdmin: isActingSystemAdmin({
      user: {
        role: actor.user.role,
        twoFactorEnabled: actor.user.twoFactorEnabled,
        locked: actor.user.locked,
      },
      session: actor.session,
    }),
    bookingId,
    bookingUid,
    path,
    action,
  });
}
