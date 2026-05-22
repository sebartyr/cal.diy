import type { CreateBookingMeta, CreateRecurringBookingData } from "@calcom/features/bookings/lib/dto/types";
import type { BookingResponse } from "@calcom/features/bookings/types";
import { type CreationSource, SchedulingType } from "@calcom/prisma/enums";
import type { AppsStatus } from "@calcom/types/Calendar";
import type { IBookingService } from "../interfaces/IBookingService";
import type { RegularBookingService } from "./RegularBookingService";
export type BookingHandlerInput = {
  bookingData: CreateRecurringBookingData;
} & CreateBookingMeta;

export const handleNewRecurringBooking = async function (
  this: RecurringBookingService,
  {
    input,
    deps,
    creationSource,
  }: {
    input: BookingHandlerInput;
    deps: IRecurringBookingServiceDependencies;
    creationSource: CreationSource;
  }
): Promise<BookingResponse[]> {
  const data = input.bookingData;
  const { regularBookingService } = deps;
  const createdBookings: BookingResponse[] = [];
  const allRecurringDates: { start: string; end: string | undefined }[] = data.map((booking) => {
    return { start: booking.start, end: booking.end };
  });
  const appsStatus: AppsStatus[] | undefined = undefined;

  const numSlotsToCheckForAvailability = 1;

  let thirdPartyRecurringEventId: string | null = null;

  // for round robin, the first slot needs to be handled first to define the lucky user
  const firstBooking = data[0];
  const isRoundRobin = firstBooking.schedulingType === SchedulingType.ROUND_ROBIN;

  let luckyUsers: number[] | undefined;

  const handleBookingMeta = {
    userId: input.userId,
    platformClientId: input.platformClientId,
    platformRescheduleUrl: input.platformRescheduleUrl,
    platformCancelUrl: input.platformCancelUrl,
    platformBookingUrl: input.platformBookingUrl,
    platformBookingLocation: input.platformBookingLocation,
    areCalendarEventsEnabled: input.areCalendarEventsEnabled,
  };

  if (isRoundRobin) {
    const recurringEventData = {
      ...firstBooking,
      appsStatus,
      allRecurringDates,
      isFirstRecurringSlot: true,
      thirdPartyRecurringEventId,
      numSlotsToCheckForAvailability,
      currentRecurringIndex: 0,
      noEmail: input.noEmail !== undefined ? input.noEmail : false,
    };

    const firstBookingResult = await regularBookingService.createBooking({
      bookingData: recurringEventData,
      bookingMeta: {
        hostname: input.hostname || "",
        forcedSlug: input.forcedSlug as string | undefined,
        ...handleBookingMeta,
      },
    });
    luckyUsers = firstBookingResult.luckyUsers;
  }

  // BUG-006 (Sprint 4): the loop used to await each booking sequentially.
  // For a recurring series capped at 52 slots that's ~50× the per-booking
  // latency. We can't parallelize the first slot (it resolves
  // thirdPartyRecurringEventId / luckyUsers — see RR branch above), but
  // every subsequent slot can run in batches once that state is fixed.
  const firstKey = isRoundRobin ? 1 : 0;
  const buildRecurringEventData = (key: number) => ({
    ...data[key],
    appsStatus,
    allRecurringDates,
    isFirstRecurringSlot: key === 0,
    thirdPartyRecurringEventId,
    numSlotsToCheckForAvailability,
    currentRecurringIndex: key,
    noEmail: input.noEmail !== undefined ? input.noEmail : key !== 0,
    luckyUsers,
  });

  const captureThirdParty = (booking: BookingResponse) => {
    if (thirdPartyRecurringEventId) return;
    if (!booking.references || booking.references.length === 0) return;
    for (const reference of booking.references) {
      if (reference.thirdPartyRecurringEventId) {
        thirdPartyRecurringEventId = reference.thirdPartyRecurringEventId;
        return;
      }
    }
  };

  // First slot of the for-loop range runs sequentially so its
  // thirdPartyRecurringEventId is available to the rest.
  if (firstKey < data.length) {
    const first = await regularBookingService.createBooking({
      bookingData: buildRecurringEventData(firstKey),
      bookingMeta: {
        hostname: input.hostname || "",
        forcedSlug: input.forcedSlug as string | undefined,
        ...handleBookingMeta,
      },
    });
    createdBookings.push(first);
    captureThirdParty(first);
  }

  // Remaining slots in batches of 5 — small enough to avoid hammering the
  // DB / calendar APIs, large enough to amortize round-trip latency.
  const BATCH = 5;
  for (let start = firstKey + 1; start < data.length; start += BATCH) {
    const end = Math.min(start + BATCH, data.length);
    const slice = await Promise.all(
      Array.from({ length: end - start }, (_, i) =>
        regularBookingService.createBooking({
          bookingData: buildRecurringEventData(start + i),
          bookingMeta: {
            hostname: input.hostname || "",
            forcedSlug: input.forcedSlug as string | undefined,
            ...handleBookingMeta,
          },
        })
      )
    );
    for (const booking of slice) {
      createdBookings.push(booking);
      captureThirdParty(booking);
    }
  }

  return createdBookings;
};

export interface IRecurringBookingServiceDependencies {
  regularBookingService: RegularBookingService;
}

/**
 * Recurring Booking Service takes care of creating/rescheduling recurring bookings.
 */
export class RecurringBookingService implements IBookingService {
  constructor(private readonly deps: IRecurringBookingServiceDependencies) {}

  async createBooking(input: {
    bookingData: CreateRecurringBookingData;
    bookingMeta?: CreateBookingMeta;
    creationSource: CreationSource;
  }): Promise<BookingResponse[]> {
    const handlerInput = {
      bookingData: input.bookingData,
      ...(input.bookingMeta || {}),
    };
    return handleNewRecurringBooking.bind(this)({
      input: handlerInput,
      deps: this.deps,
      creationSource: input.creationSource,
    });
  }

  async rescheduleBooking(input: {
    bookingData: CreateRecurringBookingData;
    bookingMeta?: CreateBookingMeta;
    creationSource: CreationSource;
  }): Promise<BookingResponse[]> {
    const handlerInput = {
      bookingData: input.bookingData,
      ...(input.bookingMeta || {}),
    };
    return handleNewRecurringBooking.bind(this)({
      input: handlerInput,
      deps: this.deps,
      creationSource: input.creationSource,
    });
  }
}
