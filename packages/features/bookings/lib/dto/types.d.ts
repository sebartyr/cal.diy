/**
 * Domain types for Booking Services
 * These types are framework-agnostic and contain only the data required for booking operations
 */
import type getBookingDataSchema from "@calcom/features/bookings/lib/getBookingDataSchema";
import type getBookingDataSchemaForApi from "@calcom/features/bookings/lib/getBookingDataSchemaForApi";
import type { TraceContext } from "@calcom/lib/tracing";
import type { SchedulingType } from "@calcom/prisma/enums";

import type { ExtendedBookingCreateBody } from "../bookingCreateBodySchema";
import type { RegularBookingService } from "../service/RegularBookingService";

export type BookingDataSchemaGetter = typeof getBookingDataSchema | typeof getBookingDataSchemaForApi;

export type CreateRegularBookingData = ExtendedBookingCreateBody;

export type CreateRecurringBookingData = (ExtendedBookingCreateBody & {
  schedulingType?: SchedulingType;
})[];

export type PlatformParams = {
  platformClientId?: string;
  platformCancelUrl?: string;
  platformBookingUrl?: string;
  platformRescheduleUrl?: string;
  platformBookingLocation?: string;
  areCalendarEventsEnabled?: boolean;
  skipAvailabilityCheck?: boolean;
  skipEventLimitsCheck?: boolean;
  skipCalendarSyncTaskCreation?: boolean;
};

export type CreateBookingMeta = {
  userId?: number;
  userUuid?: string;
  // These used to come from headers but now we're passing them as params
  hostname?: string;
  forcedSlug?: string;
  noEmail?: boolean;
  traceContext?: TraceContext;
  /**
   * Set only by RecurringBookingService, for occurrences past the ones whose
   * availability it checked. It disables the slot re-check (and its lock) in
   * createBooking, so it must never be derived from request data.
   */
  isUncheckedRecurringOccurrence?: boolean;
} & PlatformParams;

export type BookingHandlerInput = {
  bookingData: CreateRegularBookingData;
} & CreateBookingMeta;

// TODO: In a followup PR, we working on defining the type here itself instead of inferring it.
export type RegularBookingCreateResult = Awaited<ReturnType<RegularBookingService["createBooking"]>>;

// More properties to be added to this config in followup PRs
export type BookingFlowConfig = {
  isDryRun: boolean;
};
