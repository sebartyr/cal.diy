import type { CreateRecurringBookingData } from "@calcom/features/bookings/lib/dto/types";
import { CreationSource } from "@calcom/prisma/enums";
import { describe, expect, it, vi } from "vitest";
import { RecurringBookingService } from "../RecurringBookingService";
import type { RegularBookingService } from "../RegularBookingService";

function occurrence(start: string): CreateRecurringBookingData[number] {
  return { start, end: start, eventTypeId: 1 } as CreateRecurringBookingData[number];
}

describe("RecurringBookingService slot conflict re-check", () => {
  it("only lets occurrences past the availability-checked one skip the re-check", async () => {
    const createBooking = vi.fn().mockResolvedValue({ references: [], luckyUsers: [] });
    const service = new RecurringBookingService({
      regularBookingService: { createBooking } as unknown as RegularBookingService,
    });

    await service.createBooking({
      bookingData: [
        occurrence("2030-01-07T09:00:00.000Z"),
        occurrence("2030-01-14T09:00:00.000Z"),
        occurrence("2030-01-21T09:00:00.000Z"),
      ],
      creationSource: CreationSource.WEBAPP,
    });

    const flags = createBooking.mock.calls.map(
      ([input]) => input.bookingMeta.isUncheckedRecurringOccurrence
    );
    expect(flags).toEqual([false, true, true]);
  });
});
