import type { CreateEventTypeInput_2024_06_14 } from "@calcom/platform-types";
import { BadRequestException } from "@nestjs/common";
import { InputEventTypesService_2024_06_14 } from "./input-event-types.service";
import type { CalendarsService } from "@/platform/calendars/services/calendars.service";
import type { EventTypesRepository_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/event-types.repository";

describe("InputEventTypesService_2024_06_14 create defaults", () => {
  let service: InputEventTypesService_2024_06_14;
  let getEventTypeWithSeats: jest.Mock;

  const seats = { seatsPerTimeSlot: 3, showAttendeeInfo: false, showAvailabilityCount: false };
  const baseInput = { title: "Workshop", slug: "workshop", lengthInMinutes: 60 };

  beforeEach(() => {
    getEventTypeWithSeats = jest.fn();
    service = new InputEventTypesService_2024_06_14(
      { getEventTypeWithSeats } as unknown as EventTypesRepository_2024_06_14,
      {} as unknown as CalendarsService
    );
  });

  it("disables confirmation for a seated event created without a confirmation policy", async () => {
    const input = { ...baseInput, seats } as CreateEventTypeInput_2024_06_14;

    const transformed = service.transformInputCreateEventType(input);

    expect(transformed.requiresConfirmation).toBe(false);
    await expect(
      service.validateEventTypeInputs({
        seatsPerTimeSlot: transformed.seatsPerTimeSlot,
        requiresConfirmation: transformed.requiresConfirmation,
      })
    ).resolves.toBeUndefined();
  });

  it("keeps the seated event editable afterwards", async () => {
    const transformed = service.transformInputCreateEventType({
      ...baseInput,
      seats,
    } as CreateEventTypeInput_2024_06_14);
    getEventTypeWithSeats.mockResolvedValue({
      seatsPerTimeSlot: transformed.seatsPerTimeSlot,
      // What Prisma stores when the field is omitted: the schema default.
      requiresConfirmation: transformed.requiresConfirmation ?? true,
      locations: [],
    });

    await expect(service.validateEventTypeInputs({ eventTypeId: 1 })).resolves.toBeUndefined();
  });

  it("leaves confirmation to the database default when seats are not enabled", () => {
    const transformed = service.transformInputCreateEventType(baseInput as CreateEventTypeInput_2024_06_14);

    expect(transformed.requiresConfirmation).toBeUndefined();
  });

  it("still rejects seats combined with an explicit confirmation policy", async () => {
    const transformed = service.transformInputCreateEventType({
      ...baseInput,
      seats,
      confirmationPolicy: { type: "always", blockUnconfirmedBookingsInBooker: false },
    } as CreateEventTypeInput_2024_06_14);

    expect(transformed.requiresConfirmation).toBe(true);
    await expect(
      service.validateEventTypeInputs({
        seatsPerTimeSlot: transformed.seatsPerTimeSlot,
        requiresConfirmation: transformed.requiresConfirmation,
      })
    ).rejects.toThrow(BadRequestException);
  });
});
