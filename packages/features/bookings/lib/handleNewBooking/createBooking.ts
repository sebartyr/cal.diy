import dayjs from "@calcom/dayjs";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { HttpError } from "@calcom/lib/http-error";
import { isPrismaObjOrUndefined } from "@calcom/lib/isPrismaObj";
import logger from "@calcom/lib/logger";
import { withReporting } from "@calcom/lib/sentryWrapper";
import prisma from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";
import type { CreationSource } from "@calcom/prisma/enums";
import { BookingStatus } from "@calcom/prisma/enums";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type short from "short-uuid";
import type { TgetBookingDataSchema } from "../getBookingDataSchema";
import type { AwaitedBookingData, EventTypeId } from "./getBookingData";
import type { NewBookingEventType } from "./getEventTypesFromDB";
import type { LoadedUsers } from "./loadUsers";
import type { OriginalRescheduledBooking } from "./originalRescheduledBookingUtils";
import type { PaymentAppData, Tracking } from "./types";

const log = logger.getSubLogger({ prefix: ["createBooking", "slotLock"] });

/**
 * Derive a (int4, int4) key pair for `pg_advisory_xact_lock`. The lock
 * serializes concurrent createBooking() calls for the same organizer +
 * slot start so the upstream availability check (run before the
 * transaction) cannot be invalidated by a sibling request between the
 * check and the INSERT.
 *
 * The second component is the slot start in seconds, masked to int4
 * positive range. Future dates past 2038-01-19 wrap around — collisions
 * are still safe (they only widen the lock scope), so we trade a small
 * over-locking for a stable key shape.
 */
export function lockKeyForBookingSlot(
  userId: number,
  slotStart: Date
): { userPart: number; slotPart: number } {
  return {
    userPart: userId,
    slotPart: Math.floor(slotStart.getTime() / 1000) & 0x7fffffff,
  };
}

type ReqBodyWithEnd = TgetBookingDataSchema & { end: string };

type CreateBookingParams = {
  uid: short.SUUID;
  rescheduledBy: string | undefined;
  reqBody: {
    user: ReqBodyWithEnd["user"];
    metadata: ReqBodyWithEnd["metadata"];
    recurringEventId: ReqBodyWithEnd["recurringEventId"];
  };
  eventType: {
    eventTypeData: NewBookingEventType;
    id: EventTypeId;
    slug: AwaitedBookingData["eventTypeSlug"];
    organizerUser: LoadedUsers[number] & {
      isFixed?: boolean;
      metadata?: Prisma.JsonValue;
    };
    isConfirmedByDefault: boolean;
    paymentAppData: PaymentAppData;
  };
  input: {
    bookerEmail: AwaitedBookingData["email"];
    rescheduleReason: AwaitedBookingData["rescheduleReason"];
    smsReminderNumber: AwaitedBookingData["smsReminderNumber"];
    responses: ReqBodyWithEnd["responses"] | null;
  };
  evt: CalendarEvent;
  originalRescheduledBooking: OriginalRescheduledBooking;
  creationSource?: CreationSource;
  tracking?: Tracking;
};

function updateEventDetails(
  evt: CalendarEvent,
  originalRescheduledBooking: OriginalRescheduledBooking | null
) {
  if (originalRescheduledBooking) {
    evt.description = originalRescheduledBooking?.description || evt.description;
    evt.location = evt.location || originalRescheduledBooking?.location;
  }
}

// Define the function with underscore prefix
const _createBooking = async ({
  uid,
  reqBody,
  eventType,
  input,
  evt,
  originalRescheduledBooking,
  rescheduledBy,
  creationSource,
  tracking,
}: CreateBookingParams & { rescheduledBy: string | undefined }) => {
  updateEventDetails(evt, originalRescheduledBooking);

  const bookingAndAssociatedData = buildNewBookingData({
    uid,
    rescheduledBy,
    reqBody,
    eventType,
    input,
    evt,
    originalRescheduledBooking,
    creationSource,
    tracking,
  });

  return await saveBooking(
    bookingAndAssociatedData,
    originalRescheduledBooking,
    eventType.paymentAppData,
    eventType.organizerUser
  );
};

export const createBooking = withReporting(_createBooking, "createBooking");

async function saveBooking(
  bookingAndAssociatedData: ReturnType<typeof buildNewBookingData>,
  originalRescheduledBooking: OriginalRescheduledBooking,
  paymentAppData: PaymentAppData,
  organizerUser: CreateBookingParams["eventType"]["organizerUser"]
) {
  const { newBookingData, originalBookingUpdateDataForCancellation } = bookingAndAssociatedData;
  const createBookingObj = {
    include: {
      user: {
        select: {
          uuid: true,
          email: true,
          name: true,
          timeZone: true,
          username: true,
          isPlatformManaged: true,
        },
      },
      attendees: true,
      payment: true,
      references: true,
    },
    data: newBookingData,
  };

  if (originalRescheduledBooking?.paid && originalRescheduledBooking?.payment) {
    const bookingPayment = originalRescheduledBooking.payment.find((payment) => payment.success);
    if (bookingPayment) {
      createBookingObj.data.payment = { connect: { id: bookingPayment.id } };
    }
  }

  if (typeof paymentAppData.price === "number" && paymentAppData.price > 0) {
    await prisma.credential.findFirstOrThrow({
      where: {
        appId: paymentAppData.appId,
        ...(paymentAppData.credentialId ? { id: paymentAppData.credentialId } : { userId: organizerUser.id }),
      },
      select: { id: true },
    });
  }

  return prisma.$transaction(async (tx) => {
    // BUG-001 fix: serialize concurrent createBooking() calls for the same
    // (organizer, slotStart). The upstream availability check runs OUTSIDE
    // the transaction, leaving a TOCTOU window between
    // `ensureAvailableUsers` and `booking.create`. Two concurrent POST
    // /api/book/event for the same slot used to both pass the check and
    // both produce a Booking row. Confirmed by scripts/audit-poc/poc-bug-001.
    //
    // We only protect ACCEPTED state here. PENDING (requiresConfirmation)
    // is intentionally a queue — multiple attendees may request the same
    // slot; the host accepts one. Idempotent retries on PENDING are
    // handled by the idempotencyKey extension (BUG-013).
    const { startTime, endTime, status: bookingStatus } = newBookingData;
    const willBeAccepted = bookingStatus === undefined || bookingStatus === BookingStatus.ACCEPTED;

    if (startTime instanceof Date && endTime instanceof Date && willBeAccepted && organizerUser.id) {
      const { userPart, slotPart } = lockKeyForBookingSlot(organizerUser.id, startTime);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userPart}::int4, ${slotPart}::int4)`;

      // Re-check for an overlapping accepted booking. The lock guarantees
      // serial execution from this point forward for the same (user, slot)
      // pair, so a row visible here is final.
      const conflict = await tx.booking.findFirst({
        where: {
          userId: organizerUser.id,
          status: BookingStatus.ACCEPTED,
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
        select: { id: true, uid: true, startTime: true },
      });
      if (conflict) {
        log.warn("Slot conflict detected after advisory lock", {
          organizerUserId: organizerUser.id,
          requestedStart: startTime.toISOString(),
          conflictBookingId: conflict.id,
          conflictBookingUid: conflict.uid,
        });
        throw new HttpError({ statusCode: 409, message: ErrorCode.BookingConflict });
      }
    }

    if (originalBookingUpdateDataForCancellation) {
      await tx.booking.update(originalBookingUpdateDataForCancellation);
    }

    const booking = await tx.booking.create(createBookingObj);

    return { ...booking, userUuid: booking.user?.uuid ?? null };
  });
}

function getEventTypeRel(eventTypeId: EventTypeId) {
  return eventTypeId ? { connect: { id: eventTypeId } } : {};
}

function getAttendeesData(evt: Pick<CalendarEvent, "attendees" | "team">) {
  //if attendee is team member, it should fetch their locale not booker's locale
  //perhaps make email fetch request to see if his locale is stored, else
  const teamMembers = evt?.team?.members ?? [];

  return evt.attendees.concat(teamMembers).map((attendee) => ({
    name: attendee.name,
    email: attendee.email,
    timeZone: attendee.timeZone,
    locale: attendee.language.locale,
    phoneNumber: attendee.phoneNumber,
  }));
}

function buildNewBookingData(params: CreateBookingParams) {
  const {
    uid,
    evt,
    reqBody,
    eventType,
    input,
    originalRescheduledBooking,
    rescheduledBy,
    creationSource,
    tracking,
  } = params;

  const attendeesData = getAttendeesData(evt);
  const eventTypeRel = getEventTypeRel(eventType.id);
  const newBookingData: Prisma.BookingCreateInput = {
    uid,
    userPrimaryEmail: evt.organizer.email,
    responses: input.responses === null || evt.seatsPerTimeSlot ? Prisma.JsonNull : input.responses,
    title: evt.title,
    startTime: dayjs.utc(evt.startTime).toDate(),
    endTime: dayjs.utc(evt.endTime).toDate(),
    description: evt.seatsPerTimeSlot ? null : evt.additionalNotes,
    customInputs: isPrismaObjOrUndefined(evt.customInputs),
    status: eventType.isConfirmedByDefault ? BookingStatus.ACCEPTED : BookingStatus.PENDING,
    oneTimePassword: evt.oneTimePassword,
    location: evt.location,
    eventType: eventTypeRel,
    smsReminderNumber: input.smsReminderNumber,
    metadata: reqBody.metadata,
    attendees: {
      createMany: {
        data: attendeesData,
      },
    },
    dynamicEventSlugRef: !eventType.id ? eventType.slug : null,
    dynamicGroupSlugRef: !eventType.id ? (reqBody.user as string).toLowerCase() : null,
    iCalUID: evt.iCalUID ?? "",
    iCalSequence: originalRescheduledBooking ? evt.iCalSequence || 1 : 0,
    user: {
      connect: {
        id: eventType.organizerUser.id,
      },
    },
    destinationCalendar:
      evt.destinationCalendar && evt.destinationCalendar.length > 0
        ? {
            connect: { id: evt.destinationCalendar[0].id },
          }
        : undefined,
    creationSource,
    tracking: tracking ? { create: tracking } : undefined,
  };

  if (reqBody.recurringEventId) {
    newBookingData.recurringEventId = reqBody.recurringEventId;
  }

  let originalBookingUpdateDataForCancellation: Prisma.BookingUpdateArgs | undefined;

  if (originalRescheduledBooking) {
    newBookingData.metadata = {
      ...(typeof originalRescheduledBooking.metadata === "object" && originalRescheduledBooking.metadata),
      ...reqBody.metadata,
    };
    newBookingData.paid = originalRescheduledBooking.paid;
    newBookingData.fromReschedule = originalRescheduledBooking.uid;
    if (originalRescheduledBooking.uid) {
      newBookingData.cancellationReason = input.rescheduleReason;
    }
    // Reschedule logic with booking with seats
    if (
      newBookingData.attendees?.createMany?.data &&
      eventType?.eventTypeData?.seatsPerTimeSlot &&
      input.bookerEmail
    ) {
      newBookingData.attendees.createMany.data = attendeesData.filter(
        (attendee) => attendee.email === input.bookerEmail
      );
    }

    if (originalRescheduledBooking.recurringEventId) {
      newBookingData.recurringEventId = originalRescheduledBooking.recurringEventId;
    }

    if (!evt.seatsPerTimeSlot && originalRescheduledBooking?.uid) {
      originalBookingUpdateDataForCancellation = {
        where: {
          id: originalRescheduledBooking.id,
        },
        data: {
          rescheduled: true,
          status: BookingStatus.CANCELLED,
          rescheduledBy: rescheduledBy,
        },
      };
    }
  }

  return {
    newBookingData,
    originalBookingUpdateDataForCancellation,
  };
}

export type Booking = Awaited<ReturnType<typeof createBooking>>;
