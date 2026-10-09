import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingRepository } from "./BookingRepository";

describe("BookingRepository", () => {
  let repository: BookingRepository;
  let mockPrismaClient: {
    $queryRaw: ReturnType<typeof vi.fn>;
    booking: {
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrismaClient = {
      $queryRaw: vi.fn(),
      booking: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
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

  describe("getAllAcceptedTeamBookingsOfUser", () => {
    const user = { id: 7, email: "host@example.com" };
    const startDate = new Date("2026-01-01T00:00:00Z");
    const endDate = new Date("2026-01-31T23:59:59Z");
    const expectedSelect = {
      id: true,
      startTime: true,
      endTime: true,
      eventTypeId: true,
      title: true,
      userId: true,
    };
    const baseWhere = {
      status: "ACCEPTED",
      startTime: { gte: startDate },
      endTime: { lte: endDate },
    };

    const makeBooking = (id: number) => ({
      id,
      startTime: new Date("2026-01-10T10:00:00Z"),
      endTime: new Date("2026-01-10T10:30:00Z"),
      eventTypeId: 1,
      title: `Booking ${id}`,
      userId: user.id,
    });

    it("selects only the fields used for limits and keeps owner, attendee, managed order", async () => {
      mockPrismaClient.booking.findMany
        .mockResolvedValueOnce([makeBooking(1)])
        .mockResolvedValueOnce([makeBooking(2), makeBooking(1)])
        .mockResolvedValueOnce([makeBooking(3)]);

      const result = await repository.getAllAcceptedTeamBookingsOfUser({
        user,
        teamId: 42,
        startDate,
        endDate,
        includeManagedEvents: true,
      });

      expect(result.map((booking) => booking.id)).toEqual([1, 2, 1, 3]);
      expect(mockPrismaClient.booking.findMany).toHaveBeenCalledTimes(3);
      expect(mockPrismaClient.booking.findMany).toHaveBeenNthCalledWith(1, {
        where: { ...baseWhere, userId: user.id, eventType: { teamId: 42 } },
        select: expectedSelect,
      });
      expect(mockPrismaClient.booking.findMany).toHaveBeenNthCalledWith(2, {
        where: { ...baseWhere, attendees: { some: { email: user.email } }, eventType: { teamId: 42 } },
        select: expectedSelect,
      });
      expect(mockPrismaClient.booking.findMany).toHaveBeenNthCalledWith(3, {
        where: { ...baseWhere, userId: user.id, eventType: { parent: { teamId: 42 } } },
        select: expectedSelect,
      });
    });

    it("skips the managed bookings query when managed events are excluded", async () => {
      mockPrismaClient.booking.findMany.mockResolvedValueOnce([makeBooking(1)]).mockResolvedValueOnce([]);

      const result = await repository.getAllAcceptedTeamBookingsOfUser({
        user,
        teamId: 42,
        startDate,
        endDate,
        excludedUid: "rescheduled-uid",
        includeManagedEvents: false,
      });

      expect(result.map((booking) => booking.id)).toEqual([1]);
      expect(mockPrismaClient.booking.findMany).toHaveBeenCalledTimes(2);
      expect(mockPrismaClient.booking.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          ...baseWhere,
          uid: { not: "rescheduled-uid" },
          userId: user.id,
          eventType: { teamId: 42 },
        },
        select: expectedSelect,
      });
    });

    it("runs the queries concurrently instead of one after another", async () => {
      let resolveFirst: (value: unknown[]) => void = () => {};
      mockPrismaClient.booking.findMany
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
        )
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const pending = repository.getAllAcceptedTeamBookingsOfUser({
        user,
        teamId: 42,
        startDate,
        endDate,
        includeManagedEvents: true,
      });

      expect(mockPrismaClient.booking.findMany).toHaveBeenCalledTimes(3);
      resolveFirst([makeBooking(1)]);
      await expect(pending).resolves.toHaveLength(1);
    });

    it("sums owner, attendee and managed counts, double-counting overlaps as before", async () => {
      mockPrismaClient.booking.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4);

      const result = await repository.getAllAcceptedTeamBookingsOfUser({
        user,
        teamId: 42,
        startDate,
        endDate,
        includeManagedEvents: true,
        shouldReturnCount: true,
      });

      expect(result).toBe(9);
      expect(mockPrismaClient.booking.count).toHaveBeenCalledTimes(3);
      expect(mockPrismaClient.booking.findMany).not.toHaveBeenCalled();
    });

    it("does not count managed bookings when managed events are excluded", async () => {
      mockPrismaClient.booking.count.mockResolvedValueOnce(2).mockResolvedValueOnce(3);

      const result = await repository.getAllAcceptedTeamBookingsOfUser({
        user,
        teamId: 42,
        startDate,
        endDate,
        includeManagedEvents: false,
        shouldReturnCount: true,
      });

      expect(result).toBe(5);
      expect(mockPrismaClient.booking.count).toHaveBeenCalledTimes(2);
    });
  });

  describe("getAllAcceptedTeamBookingsOfUsers", () => {
    it("filters owners by ids and attendees by emails with the narrow select", async () => {
      mockPrismaClient.booking.findMany.mockResolvedValue([]);
      const startDate = new Date("2026-01-01T00:00:00Z");
      const endDate = new Date("2026-01-31T23:59:59Z");

      await repository.getAllAcceptedTeamBookingsOfUsers({
        users: [
          { id: 1, email: "a@example.com" },
          { id: 2, email: "b@example.com" },
        ],
        teamId: 42,
        startDate,
        endDate,
        includeManagedEvents: false,
      });

      expect(mockPrismaClient.booking.findMany).toHaveBeenCalledTimes(2);
      expect(mockPrismaClient.booking.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({ userId: { in: [1, 2] }, eventType: { teamId: 42 } }),
          select: expect.objectContaining({ id: true, userId: true }),
        })
      );
      expect(mockPrismaClient.booking.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            attendees: { some: { email: { in: ["a@example.com", "b@example.com"] } } },
          }),
        })
      );
    });
  });
});
