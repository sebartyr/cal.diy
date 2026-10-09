import dayjs from "@calcom/dayjs";
import { stringToDayjs } from "@calcom/lib/dayjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IAvailableSlotsService } from "./util";
import { AvailableSlotsService } from "./util";

type CalculateArgs = {
  input: { duration?: number; rescheduleUid?: string | null };
  eventType: Record<string, unknown>;
  hosts: { isFixed?: boolean; user: Record<string, unknown> }[];
  loggerWithEventDetails: { debug: () => void };
  startTime: ReturnType<typeof dayjs>;
  endTime: ReturnType<typeof dayjs>;
  bypassBusyCalendarTimes: boolean;
  silentCalendarFailures: boolean;
};

type CalculateResult = { currentSeats: unknown };

type ServiceInternals = {
  calculateHostsAndAvailabilities: (args: CalculateArgs) => Promise<CalculateResult>;
  _getReservedSlotsAndCleanupExpired: (args: {
    bookerClientUid: string | undefined;
    usersWithCredentials: { id: number }[];
    eventTypeId: number;
  }) => Promise<{ uid: string }[]>;
};

const availabilityResult = (currentSeats: unknown) => ({
  busy: [],
  dateRanges: [],
  oooExcludedDateRanges: [],
  currentSeats,
  timeZone: "UTC",
  datesOutOfOffice: undefined,
});

describe("AvailableSlotsService - repeated queries", () => {
  let mockDependencies: {
    bookingRepo: { findAllExistingBookingsForEventTypeBetween: ReturnType<typeof vi.fn> };
    oooRepo: { findManyOOO: ReturnType<typeof vi.fn> };
    busyTimesService: {
      getStartEndDateforLimitCheck: ReturnType<typeof vi.fn>;
      getBusyTimesForLimitChecks: ReturnType<typeof vi.fn>;
    };
    userAvailabilityService: {
      getPeriodStartDatesBetween: ReturnType<typeof vi.fn>;
      getUsersAvailability: ReturnType<typeof vi.fn>;
      getCurrentSeats: ReturnType<typeof vi.fn>;
    };
    selectedSlotRepo: {
      findManyUnexpiredSlots: ReturnType<typeof vi.fn>;
      deleteManyExpiredSlots: ReturnType<typeof vi.fn>;
    };
  };
  let service: ServiceInternals;

  const hosts = [
    { isFixed: true, user: { id: 1, email: "one@example.com", timeZone: "UTC" } },
    { isFixed: true, user: { id: 2, email: "two@example.com", timeZone: "UTC" } },
  ];
  const startTime = dayjs.utc("2026-03-02T00:00:00Z");
  const endTime = dayjs.utc("2026-03-09T00:00:00Z");

  const calculate = (eventType: Record<string, unknown>) =>
    service.calculateHostsAndAvailabilities({
      input: { duration: 30 },
      eventType: { id: 10, afterEventBuffer: 0, beforeEventBuffer: 0, schedule: null, ...eventType },
      hosts,
      loggerWithEventDetails: { debug: () => undefined },
      startTime,
      endTime,
      bypassBusyCalendarTimes: false,
      silentCalendarFailures: false,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDependencies = {
      bookingRepo: { findAllExistingBookingsForEventTypeBetween: vi.fn().mockResolvedValue([]) },
      oooRepo: { findManyOOO: vi.fn().mockResolvedValue([]) },
      busyTimesService: {
        getStartEndDateforLimitCheck: vi.fn().mockReturnValue({
          limitDateFrom: dayjs.utc("2026-03-01"),
          limitDateTo: dayjs.utc("2026-03-31"),
        }),
        getBusyTimesForLimitChecks: vi.fn().mockResolvedValue([]),
      },
      userAvailabilityService: {
        getPeriodStartDatesBetween: vi.fn().mockReturnValue([]),
        getUsersAvailability: vi.fn().mockResolvedValue([availabilityResult(null), availabilityResult(null)]),
        getCurrentSeats: vi.fn(),
      },
      selectedSlotRepo: {
        findManyUnexpiredSlots: vi.fn(),
        deleteManyExpiredSlots: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    service = new AvailableSlotsService(
      mockDependencies as unknown as IAvailableSlotsService
    ) as unknown as ServiceInternals;
  });

  describe("booking limits", () => {
    it("fetches the bookings for limit checks once, on the widened limit range", async () => {
      await calculate({ bookingLimits: { PER_DAY: 2 } });

      expect(mockDependencies.busyTimesService.getBusyTimesForLimitChecks).toHaveBeenCalledTimes(1);
      expect(mockDependencies.busyTimesService.getBusyTimesForLimitChecks).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: [1, 2],
          eventTypeId: 10,
          startDate: dayjs.utc("2026-03-01").format(),
          endDate: dayjs.utc("2026-03-31").format(),
        })
      );

      const { initialData } = mockDependencies.userAvailabilityService.getUsersAvailability.mock.calls[0][0];
      expect(initialData).not.toHaveProperty("busyTimesFromLimitsBookings");
      expect(initialData.busyTimesFromLimits).toBeInstanceOf(Map);
      expect(initialData.eventTypeForLimits).toMatchObject({ id: 10 });
    });

    it("does not fetch bookings for limit checks when the event type has no limits", async () => {
      await calculate({});

      expect(mockDependencies.busyTimesService.getBusyTimesForLimitChecks).not.toHaveBeenCalled();
    });
  });

  describe("seated events", () => {
    it("loads the current seats once and shares them with every host", async () => {
      const seats = [
        { uid: "booking-1", startTime: new Date("2026-03-03T10:00:00Z"), _count: { attendees: 1 } },
      ];
      mockDependencies.userAvailabilityService.getCurrentSeats.mockResolvedValue(seats);
      mockDependencies.userAvailabilityService.getUsersAvailability.mockResolvedValue([
        availabilityResult(seats),
        availabilityResult(seats),
      ]);

      const result = await calculate({ seatsPerTimeSlot: 3 });

      expect(mockDependencies.userAvailabilityService.getCurrentSeats).toHaveBeenCalledTimes(1);
      const [eventTypeArg, dateFromArg, dateToArg] =
        mockDependencies.userAvailabilityService.getCurrentSeats.mock.calls[0];
      expect(eventTypeArg).toMatchObject({ id: 10, seatsPerTimeSlot: 3 });
      expect(dateFromArg.format()).toBe(stringToDayjs(startTime.format()).format());
      expect(dateToArg.format()).toBe(stringToDayjs(endTime.format()).format());

      const { initialData, query } =
        mockDependencies.userAvailabilityService.getUsersAvailability.mock.calls[0][0];
      expect(initialData.currentSeats).toBe(seats);
      expect(query.dateFrom).toBe(startTime.format());
      expect(query.dateTo).toBe(endTime.format());
      expect(result.currentSeats).toBe(seats);
    });

    it("keeps returning the first host's seats, as before", async () => {
      const seats = [
        { uid: "booking-1", startTime: new Date("2026-03-03T10:00:00Z"), _count: { attendees: 1 } },
      ];
      mockDependencies.userAvailabilityService.getCurrentSeats.mockResolvedValue(seats);
      mockDependencies.userAvailabilityService.getUsersAvailability.mockResolvedValue([
        availabilityResult([]),
        availabilityResult(seats),
      ]);

      const result = await calculate({ seatsPerTimeSlot: 3 });

      expect(result.currentSeats).toEqual([]);
    });

    it("does not load seats for events without seats", async () => {
      const result = await calculate({ seatsPerTimeSlot: null });

      expect(mockDependencies.userAvailabilityService.getCurrentSeats).not.toHaveBeenCalled();
      const { initialData } = mockDependencies.userAvailabilityService.getUsersAvailability.mock.calls[0][0];
      expect(initialData.currentSeats).toBeUndefined();
      expect(result.currentSeats).toBeUndefined();
    });
  });

  describe("host data", () => {
    const booking = (id: number, userId: number | null, attendeeEmails: string[]) => ({
      id,
      uid: `booking-${id}`,
      userId,
      startTime: new Date("2026-03-03T10:00:00Z"),
      endTime: new Date("2026-03-03T10:30:00Z"),
      title: `Booking ${id}`,
      attendees: attendeeEmails.map((email) => ({ email })),
      eventType: null,
    });
    const withoutAttendees = ({ attendees: _attendees, ...rest }: ReturnType<typeof booking>) => rest;

    it("gives each host the bookings it organizes or attends, in order, once each", async () => {
      const bookings = [
        booking(1, 1, ["guest@example.com"]),
        booking(2, 3, ["two@example.com"]),
        booking(3, 1, ["one@example.com", "two@example.com"]),
        booking(4, null, ["one@example.com"]),
        booking(5, 3, ["guest@example.com"]),
      ];
      mockDependencies.bookingRepo.findAllExistingBookingsForEventTypeBetween.mockResolvedValue(bookings);

      await calculate({});

      const { users } = mockDependencies.userAvailabilityService.getUsersAvailability.mock.calls[0][0];
      expect(users.map((user: { id: number }) => user.id)).toEqual([1, 2]);
      expect(users[0].currentBookings).toEqual([bookings[0], bookings[2], bookings[3]].map(withoutAttendees));
      expect(users[1].currentBookings).toEqual([bookings[1], bookings[2]].map(withoutAttendees));
    });

    it("groups out-of-office entries by host", async () => {
      const ooo = (id: number, userId: number) => ({ id, user: { id: userId, name: null } });
      const entries = [ooo(1, 2), ooo(2, 1), ooo(3, 2)];
      mockDependencies.oooRepo.findManyOOO.mockResolvedValue(entries);

      await calculate({});

      const { users } = mockDependencies.userAvailabilityService.getUsersAvailability.mock.calls[0][0];
      expect(users[0].outOfOfficeDays).toEqual([entries[1]]);
      expect(users[1].outOfOfficeDays).toEqual([entries[0], entries[2]]);
    });

    it("looks up out-of-office entries from the requested start when it is in the past", async () => {
      await calculate({});

      expect(mockDependencies.oooRepo.findManyOOO).toHaveBeenCalledWith({
        startTimeDate: startTime.toDate(),
        endTimeDate: endTime.toDate(),
        allUserIds: [1, 2],
      });
    });
  });

  describe("_getReservedSlotsAndCleanupExpired", () => {
    it("reads unexpired slots and deletes expired ones concurrently", async () => {
      let resolveRead: (value: { uid: string }[]) => void = () => undefined;
      mockDependencies.selectedSlotRepo.findManyUnexpiredSlots.mockReturnValue(
        new Promise((resolve) => {
          resolveRead = resolve;
        })
      );

      const pending = service._getReservedSlotsAndCleanupExpired({
        bookerClientUid: "me",
        usersWithCredentials: [{ id: 1 }, { id: 2 }],
        eventTypeId: 10,
      });

      expect(mockDependencies.selectedSlotRepo.deleteManyExpiredSlots).toHaveBeenCalledWith({
        eventTypeId: 10,
        currentTimeInUtc: expect.any(String),
      });
      resolveRead([{ uid: "me" }, { uid: "other" }]);

      await expect(pending).resolves.toEqual([{ uid: "other" }]);
      const readArgs = mockDependencies.selectedSlotRepo.findManyUnexpiredSlots.mock.calls[0][0];
      const deleteArgs = mockDependencies.selectedSlotRepo.deleteManyExpiredSlots.mock.calls[0][0];
      expect(readArgs).toEqual({ userIds: [1, 2], currentTimeInUtc: deleteArgs.currentTimeInUtc });
    });

    it("returns an empty list when the repository returns nothing", async () => {
      mockDependencies.selectedSlotRepo.findManyUnexpiredSlots.mockResolvedValue(null);

      await expect(
        service._getReservedSlotsAndCleanupExpired({
          bookerClientUid: undefined,
          usersWithCredentials: [{ id: 1 }],
          eventTypeId: 10,
        })
      ).resolves.toEqual([]);
    });
  });
});
