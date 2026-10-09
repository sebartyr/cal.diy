import { UserAvailabilityService } from "@calcom/features/availability/lib/getUserAvailability";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getOOOLookupStartDate } from "./getOOOLookupStartDate";

vi.mock("@calcom/app-store/_utils/getCalendar", () => ({ getCalendar: vi.fn() }));
vi.mock("@calcom/features/di/containers/BusyTimes", () => ({ getBusyTimesService: vi.fn() }));

describe("getOOOLookupStartDate", () => {
  const now = new Date("2026-10-09T15:30:00Z");

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at yesterday 00:00 UTC when the requested range starts later", () => {
    expect(getOOOLookupStartDate(new Date("2026-11-01T00:00:00Z"), now)).toEqual(
      new Date("2026-10-08T00:00:00Z")
    );
    expect(getOOOLookupStartDate(new Date("2026-10-09T16:00:00Z"), now)).toEqual(
      new Date("2026-10-08T00:00:00Z")
    );
  });

  it("keeps the requested start when it is earlier", () => {
    const dateFrom = new Date("2026-10-01T00:00:00Z");
    expect(getOOOLookupStartDate(dateFrom, now)).toEqual(dateFrom);
  });

  it("uses the UTC day even right after midnight UTC", () => {
    expect(getOOOLookupStartDate(new Date("2026-12-01T00:00:00Z"), new Date("2026-10-09T00:00:01Z"))).toEqual(
      new Date("2026-10-08T00:00:00Z")
    );
  });

  describe("matches what calculateOutOfOfficeRanges keeps", () => {
    const service = new UserAvailabilityService(
      {} as ConstructorParameters<typeof UserAvailabilityService>[0]
    );
    const everyDay = [
      { days: [0, 1, 2, 3, 4, 5, 6], startTime: new Date(), endTime: new Date(), date: null },
    ];
    const entry = (start: string, end: string) => ({
      id: 1,
      start: new Date(start),
      end: new Date(end),
      notes: null,
      showNotePublicly: false,
      user: { id: 1, name: null },
      toUser: null,
      reason: null,
    });

    it("drops nothing that would produce an out-of-office day", () => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const lookupStart = getOOOLookupStartDate(new Date("2026-11-01T00:00:00Z"));

      const endedBeforeLookup = entry("2026-10-01T00:00:00.000Z", "2026-10-07T23:59:59.999Z");
      expect(endedBeforeLookup.end < lookupStart).toBe(true);
      expect(service.calculateOutOfOfficeRanges([endedBeforeLookup], everyDay)).toEqual({});

      const endingToday = entry("2026-10-01T00:00:00.000Z", "2026-10-09T23:59:59.999Z");
      expect(endingToday.end >= lookupStart).toBe(true);
      expect(Object.keys(service.calculateOutOfOfficeRanges([endingToday], everyDay))).toEqual([
        "2026-10-09",
      ]);
    });
  });
});
