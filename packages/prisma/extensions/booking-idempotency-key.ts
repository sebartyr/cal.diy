import { v5 as uuidv5 } from "uuid";
import { Prisma } from "../client";
import { BookingStatus } from "../enums";

/**
 * Build the per-booking idempotency key.
 *
 * For ACCEPTED bookings: the key is bound to (start, end, userId,
 * reassignedById). Combined with the `@unique` constraint on
 * Booking.idempotencyKey this prevents the same organizer from holding
 * two ACCEPTED bookings on the same slot (cf. BUG-001 lock).
 *
 * For PENDING bookings: the key additionally folds in the booker email.
 * A requiresConfirmation event type is a queue — multiple distinct
 * attendees may request the same slot — so we don't want the unique
 * index to reject those. But we DO want to reject an exact-duplicate
 * retry from the same client (same start/end/booker), which is the
 * BUG-013 case. Folding the booker email in achieves both.
 */
export function buildBookingIdempotencyKey({
  startTime,
  endTime,
  userId,
  reassignedById,
  bookerEmail,
}: {
  startTime: Date | string;
  endTime: Date | string;
  userId?: number;
  reassignedById?: number | null;
  bookerEmail?: string | null;
}) {
  const parts = [
    startTime.valueOf(),
    endTime.valueOf(),
    userId,
    reassignedById ? `r${reassignedById}` : "",
    bookerEmail ? `b${bookerEmail.toLowerCase()}` : "",
  ];
  return uuidv5(parts.join("."), uuidv5.URL);
}

type AttendeesCreateInput = NonNullable<Prisma.BookingCreateInput["attendees"]>;

/**
 * Best-effort lookup of the first attendee email out of the polymorphic
 * `attendees` create payload Prisma accepts. Returns null if the shape
 * doesn't expose an email (e.g. only `connect:` — never seen in this
 * code path but defensible).
 */
function firstAttendeeEmail(attendees: AttendeesCreateInput | undefined): string | null {
  if (!attendees) return null;
  if ("createMany" in attendees && attendees.createMany?.data) {
    const data = attendees.createMany.data;
    const first = Array.isArray(data) ? data[0] : data;
    return first && "email" in first ? (first.email ?? null) : null;
  }
  if ("create" in attendees && attendees.create) {
    const create = attendees.create;
    const first = Array.isArray(create) ? create[0] : create;
    return first && "email" in first ? (first.email ?? null) : null;
  }
  return null;
}

export function bookingIdempotencyKeyExtension() {
  return Prisma.defineExtension({
    query: {
      booking: {
        async create({ args, query }) {
          const status = args.data.status;
          if (status === BookingStatus.ACCEPTED || status === BookingStatus.PENDING) {
            args.data.idempotencyKey = buildBookingIdempotencyKey({
              startTime: args.data.startTime,
              endTime: args.data.endTime,
              userId: args.data.user?.connect?.id,
              reassignedById: args.data.reassignById,
              bookerEmail: status === BookingStatus.PENDING ? firstAttendeeEmail(args.data.attendees) : null,
            });
          }
          return query(args);
        },
        async update({ args, query }) {
          if (args.data.status === BookingStatus.CANCELLED || args.data.status === BookingStatus.REJECTED) {
            args.data.idempotencyKey = null;
          }
          return query(args);
        },
        async updateMany({ args, query }) {
          if (args.data.status === BookingStatus.CANCELLED || args.data.status === BookingStatus.REJECTED) {
            args.data.idempotencyKey = null;
          }
          return query(args);
        },
      },
    },
  });
}
