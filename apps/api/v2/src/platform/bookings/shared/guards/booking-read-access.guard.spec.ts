import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { BookingReadAccessGuard } from "./booking-read-access.guard";
import type { BookingReadAccessRepository } from "@/platform/bookings/shared/booking-read-access.repository";
import type { PrismaReadService } from "@/modules/prisma/prisma-read.service";

const doesUserIdHaveAccessToBooking = jest.fn();

jest.mock("@calcom/platform-libraries", () => ({
  BookingAccessService: jest.fn().mockImplementation(() => ({ doesUserIdHaveAccessToBooking })),
}));

describe("BookingReadAccessGuard", () => {
  let repository: jest.Mocked<
    Pick<
      BookingReadAccessRepository,
      "findUidByUid" | "findFirstUidByRecurringEventId" | "findUidBySeatReferenceUid" | "isAttendee"
    >
  >;
  let guard: BookingReadAccessGuard;

  const contextFor = (params: Record<string, string>, user?: { id: number; email: string }) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ params, user }) }),
    }) as unknown as ExecutionContext;

  const stranger = { id: 99, email: "stranger@example.com" };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = {
      findUidByUid: jest.fn().mockResolvedValue("booking-uid"),
      findFirstUidByRecurringEventId: jest.fn().mockResolvedValue(null),
      findUidBySeatReferenceUid: jest.fn().mockResolvedValue(null),
      isAttendee: jest.fn().mockResolvedValue(false),
    };
    doesUserIdHaveAccessToBooking.mockResolvedValue(false);
    guard = new BookingReadAccessGuard(
      repository as unknown as BookingReadAccessRepository,
      { prisma: {} } as unknown as PrismaReadService
    );
  });

  it("lets the organizer, a host or a team/org admin read the booking", async () => {
    doesUserIdHaveAccessToBooking.mockResolvedValue(true);

    await expect(guard.canActivate(contextFor({ bookingUid: "booking-uid" }, stranger))).resolves.toBe(true);
    expect(doesUserIdHaveAccessToBooking).toHaveBeenCalledWith({ userId: 99, bookingUid: "booking-uid" });
  });

  it("lets an attendee read the booking", async () => {
    repository.isAttendee.mockResolvedValue(true);

    await expect(
      guard.canActivate(contextFor({ bookingUid: "booking-uid" }, { id: 7, email: "Ada@Example.com" }))
    ).resolves.toBe(true);
    expect(repository.isAttendee).toHaveBeenCalledWith("booking-uid", "Ada@Example.com");
  });

  it("refuses an authenticated caller unrelated to the booking", async () => {
    await expect(guard.canActivate(contextFor({ bookingUid: "booking-uid" }, stranger))).rejects.toThrow(
      ForbiddenException
    );
  });

  it("refuses an anonymous request", async () => {
    await expect(guard.canActivate(contextFor({ bookingUid: "booking-uid" }))).rejects.toThrow(
      UnauthorizedException
    );
  });

  it("checks a recurring booking read by its recurringEventId on one of its recurrences", async () => {
    repository.findUidByUid.mockResolvedValue(null);
    repository.findFirstUidByRecurringEventId.mockResolvedValue("first-recurrence");

    await expect(guard.canActivate(contextFor({ bookingUid: "recurring-id" }, stranger))).rejects.toThrow(
      ForbiddenException
    );
    expect(doesUserIdHaveAccessToBooking).toHaveBeenCalledWith({ userId: 99, bookingUid: "first-recurrence" });
  });

  it("checks a booking read by seat uid on the booking of that seat", async () => {
    repository.findUidBySeatReferenceUid.mockResolvedValue("seated-booking");

    await expect(guard.canActivate(contextFor({ seatUid: "seat-1" }, stranger))).rejects.toThrow(
      ForbiddenException
    );
    expect(doesUserIdHaveAccessToBooking).toHaveBeenCalledWith({ userId: 99, bookingUid: "seated-booking" });
  });

  it("lets an unknown uid through so the route answers 404", async () => {
    repository.findUidByUid.mockResolvedValue(null);

    await expect(guard.canActivate(contextFor({ bookingUid: "missing" }, stranger))).resolves.toBe(true);
    expect(doesUserIdHaveAccessToBooking).not.toHaveBeenCalled();
  });
});
