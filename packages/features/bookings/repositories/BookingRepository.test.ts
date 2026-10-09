import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingRepository } from "./BookingRepository";

describe("BookingRepository", () => {
  let repository: BookingRepository;
  let mockPrismaClient: {
    $queryRaw: ReturnType<typeof vi.fn>;
    booking: { findFirst: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrismaClient = {
      $queryRaw: vi.fn(),
      booking: { findFirst: vi.fn() },
    };

    repository = new BookingRepository(mockPrismaClient as unknown as PrismaClient);
  });

  describe("getTotalBookingDuration", () => {
    it("should return total minutes from the database result", async () => {
      mockPrismaClient.$queryRaw.mockResolvedValue([{ totalMinutes: 120 }]);

      const result = await repository.getTotalBookingDuration({
        eventId: 52,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      });

      expect(result).toBe(120);
      expect(mockPrismaClient.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it("should return 0 when totalMinutes is null", async () => {
      mockPrismaClient.$queryRaw.mockResolvedValue([{ totalMinutes: null }]);

      const result = await repository.getTotalBookingDuration({
        eventId: 52,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      });

      expect(result).toBe(0);
    });

    it("should call query when rescheduleUid is provided", async () => {
      mockPrismaClient.$queryRaw.mockResolvedValue([{ totalMinutes: 90 }]);

      const result = await repository.getTotalBookingDuration({
        eventId: 52,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        rescheduleUid: "existing-booking-uid",
      });

      expect(result).toBe(90);
      expect(mockPrismaClient.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });
  describe("getValidBookingFromEventTypeForAttendee", () => {
    const params = {
      eventTypeId: 7,
      bookerEmail: "booker@example.com",
      startTime: new Date("2026-03-01T10:00:00.000Z"),
    };

    it("selects only the organizer fields the regular booking path returns", async () => {
      mockPrismaClient.booking.findFirst.mockResolvedValue(null);

      await repository.getValidBookingFromEventTypeForAttendee(params);

      expect(mockPrismaClient.booking.findFirst).toHaveBeenCalledTimes(1);
      const args = mockPrismaClient.booking.findFirst.mock.calls[0][0];
      expect(args.include.user).toEqual({
        select: {
          uuid: true,
          email: true,
          name: true,
          timeZone: true,
          username: true,
          isPlatformManaged: true,
        },
      });
    });

    it("never selects sensitive user columns", async () => {
      mockPrismaClient.booking.findFirst.mockResolvedValue(null);

      await repository.getValidBookingFromEventTypeForAttendee(params);

      const userSelect = mockPrismaClient.booking.findFirst.mock.calls[0][0].include.user.select;
      for (const field of [
        "twoFactorSecret",
        "backupCodes",
        "twoFactorEnabled",
        "identityProviderId",
        "metadata",
        "password",
      ]) {
        expect(userSelect).not.toHaveProperty(field);
      }
    });

    it("keeps the same filters and booking relations", async () => {
      mockPrismaClient.booking.findFirst.mockResolvedValue(null);

      await repository.getValidBookingFromEventTypeForAttendee({ ...params, filterForUnconfirmed: true });

      const args = mockPrismaClient.booking.findFirst.mock.calls[0][0];
      expect(args.where).toEqual({
        eventTypeId: 7,
        attendees: { some: { email: "booker@example.com", phoneNumber: undefined } },
        startTime: params.startTime,
        status: "PENDING",
      });
      expect(args.include).toMatchObject({ attendees: true, references: true, payment: true });
    });
  });
});
