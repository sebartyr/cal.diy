type BookingWithVideoReferences = {
  uid: string;
  references: { id: number; meetingUrl: string | null }[];
};

const isHttpUrl = (value: string | null): value is string => {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
};

/**
 * Cal Video invitations sent before its removal point at WEBAPP_URL/video/<booking uid>. Send
 * them to the booking's most recent meeting URL (e.g. Jitsi once rescheduled), or to the
 * booking page, which shows its current location. Only URLs stored on the booking are used,
 * so this cannot be turned into an open redirect.
 */
export function getLegacyVideoRedirectUrl(booking: BookingWithVideoReferences): string {
  const latestFirst = [...booking.references].sort((a, b) => b.id - a.id);
  const meetingUrl = latestFirst.map((reference) => reference.meetingUrl).find(isHttpUrl);
  return meetingUrl ?? `/booking/${encodeURIComponent(booking.uid)}`;
}
