/**
 * GET /v2/bookings/:uid has always been readable without authentication: the uid is a bearer
 * capability (booking links, confirmation pages). Anonymous callers keep the booking itself but not
 * the personal data of the people in it: emails, phone numbers, guests, form answers, the video
 * call URL and the free-form metadata. Authenticated callers are unaffected.
 */

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isUrl = (value: unknown) => typeof value === "string" && /^[a-z][a-z0-9+.-]*:\/\//i.test(value);

const withoutKeys = (record: UnknownRecord, keys: string[]): UnknownRecord => {
  const copy = { ...record };
  for (const key of keys) delete copy[key];
  return copy;
};

const ATTENDEE_PRIVATE_KEYS = ["email", "displayEmail", "phoneNumber", "bookingFieldsResponses", "metadata"];

function anonymizeBooking_2024_08_13(booking: UnknownRecord): UnknownRecord {
  const anonymized: UnknownRecord = {
    ...booking,
    guests: [],
    bookingFieldsResponses: {},
    metadata: {},
    cancelledByEmail: undefined,
    rescheduledByEmail: undefined,
  };
  if (isUrl(booking.location)) anonymized.location = undefined;
  if (isUrl(booking.meetingUrl)) anonymized.meetingUrl = undefined;
  if (Array.isArray(booking.attendees)) {
    anonymized.attendees = booking.attendees.map((attendee) =>
      isRecord(attendee) ? withoutKeys(attendee, ATTENDEE_PRIVATE_KEYS) : attendee
    );
  }
  if (Array.isArray(booking.hosts)) {
    anonymized.hosts = booking.hosts.map((host) => (isRecord(host) ? withoutKeys(host, ["email"]) : host));
  }
  return anonymized;
}

/** Output of the dated versions (2024-08-13 and later): one booking or an array of recurrences. */
export function toAnonymousBookingOutput_2024_08_13<T>(output: T): T {
  if (Array.isArray(output)) {
    return output.map((booking) => (isRecord(booking) ? anonymizeBooking_2024_08_13(booking) : booking)) as T;
  }
  return (isRecord(output) ? anonymizeBooking_2024_08_13(output) : output) as T;
}

/** Output of the default version (2024-04-15), which returns the raw booking info. */
export function toAnonymousBookingInfo_2024_04_15<T extends UnknownRecord>(bookingInfo: T): T {
  const anonymized: UnknownRecord = withoutKeys(bookingInfo, [
    "smsReminderNumber",
    "userPrimaryEmail",
    "cancelledBy",
    "rescheduledBy",
    "tracking",
  ]);
  anonymized.responses = {};
  anonymized.customInputs = {};
  anonymized.description = null;
  if (isUrl(bookingInfo.location)) anonymized.location = null;
  if (isRecord(bookingInfo.metadata)) anonymized.metadata = withoutKeys(bookingInfo.metadata, ["videoCallUrl"]);
  if (isRecord(bookingInfo.user)) anonymized.user = withoutKeys(bookingInfo.user, ["email"]);
  if (Array.isArray(bookingInfo.attendees)) {
    anonymized.attendees = bookingInfo.attendees.map((attendee) =>
      isRecord(attendee) ? withoutKeys(attendee, ["email", "phoneNumber"]) : attendee
    );
  }
  return anonymized as T;
}
