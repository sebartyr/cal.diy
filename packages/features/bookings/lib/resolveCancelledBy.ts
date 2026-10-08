type BookingParticipants = {
  userId: number | null;
  user: { email: string } | null;
  userPrimaryEmail: string | null;
  attendees: { email: string }[];
  eventType: { hosts: { user: { email: string } }[] } | null;
};

type ResolveCancelledByInput = {
  claimedEmail: string | undefined;
  actorUserId: number | undefined;
  booking: BookingParticipants;
  findActorEmail: (userId: number) => Promise<string | null>;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * `cancelledBy` comes from the request body, so it is attacker-controlled. It is stored on the
 * booking, sent in webhooks and used to decide whether the host must give a reason, so it may only
 * name the authenticated actor or, for the public cancel link, someone who is part of the booking.
 */
export async function resolveCancelledBy({
  claimedEmail,
  actorUserId,
  booking,
  findActorEmail,
}: ResolveCancelledByInput): Promise<string | undefined> {
  if (actorUserId && actorUserId > 0) {
    if (actorUserId === booking.userId && booking.user) return booking.user.email;
    const actorEmail = await findActorEmail(actorUserId);
    if (actorEmail) return actorEmail;
  }

  if (!claimedEmail) return undefined;

  const participantEmails = new Set<string>();
  const addEmail = (email: string | null | undefined) => {
    if (email) participantEmails.add(normalizeEmail(email));
  };
  addEmail(booking.user?.email);
  addEmail(booking.userPrimaryEmail);
  for (const attendee of booking.attendees) addEmail(attendee.email);
  for (const host of booking.eventType?.hosts ?? []) addEmail(host.user.email);

  return participantEmails.has(normalizeEmail(claimedEmail)) ? claimedEmail : undefined;
}
