import { updateEventType } from "@calcom/platform-libraries/event-types";
import { EventTypesService_2024_04_15 } from "./event-types.service";
import type { EventTypesRepository_2024_04_15 } from "@/platform/event-types/event-types_2024_04_15/event-types.repository";
import type { UpdateEventTypeInput_2024_04_15 } from "@/platform/event-types/event-types_2024_04_15/inputs/update-event-type.input";
import type { MembershipsRepository } from "@/modules/memberships/memberships.repository";
import type { PrismaWriteService } from "@/modules/prisma/prisma-write.service";
import type { SelectedCalendarsRepository } from "@/modules/selected-calendars/selected-calendars.repository";
import type { UsersService } from "@/modules/users/services/users.service";
import type { UserWithProfile, UsersRepository } from "@/modules/users/users.repository";

jest.mock("@calcom/platform-libraries/event-types", () => ({
  createEventType: jest.fn(),
  updateEventType: jest.fn(),
  getEventTypesPublic: jest.fn(),
}));

describe("EventTypesService_2024_04_15.updateEventType", () => {
  const user = { id: 1 } as UserWithProfile;
  let service: EventTypesService_2024_04_15;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EventTypesService_2024_04_15(
      {} as unknown as EventTypesRepository_2024_04_15,
      {} as unknown as MembershipsRepository,
      {} as unknown as UsersRepository,
      {} as unknown as SelectedCalendarsRepository,
      { prisma: {} } as unknown as PrismaWriteService,
      {} as unknown as UsersService
    );
    jest.spyOn(service, "checkCanUpdateEventType").mockResolvedValue(undefined);
    jest.spyOn(service, "getUserToUpdateEvent").mockResolvedValue({} as never);
    jest.spyOn(service, "getUserEventTypeForAtom").mockResolvedValue({ eventType: {} } as never);
  });

  const inputSentToUpdate = () => jest.mocked(updateEventType).mock.calls[0][0].input;

  it("turns confirmation off when seats are enabled", async () => {
    await service.updateEventType(10, { seatsPerTimeSlot: 3 } as UpdateEventTypeInput_2024_04_15, user);

    expect(inputSentToUpdate()).toMatchObject({ id: 10, seatsPerTimeSlot: 3, requiresConfirmation: false });
  });

  it("leaves confirmation untouched when seats are not part of the update", async () => {
    await service.updateEventType(10, { title: "Renamed" } as UpdateEventTypeInput_2024_04_15, user);

    expect(inputSentToUpdate()).not.toHaveProperty("requiresConfirmation");
  });
});
