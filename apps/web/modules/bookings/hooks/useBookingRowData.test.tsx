import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingsGetOutput } from "../types";
import { useBookingCalendarData } from "./useBookingCalendarData";
import { useBookingListData } from "./useBookingListData";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("@calcom/trpc/react/hooks/useMeQuery", () => ({
  default: () => ({ data: { timeZone: "UTC" } }),
}));

type Booking = BookingsGetOutput["bookings"][number];
type RecurringInfo = BookingsGetOutput["recurringInfo"][number];

const makeBooking = (id: number, startTime: string, recurringEventId: string | null = null) =>
  ({ id, startTime, recurringEventId }) as unknown as Booking;

const makeInfo = (recurringEventId: string): RecurringInfo => ({
  recurringEventId,
  count: 3,
  firstDate: null,
  bookings: {},
});

const TODAY = "2026-10-09T09:00:00.000Z";
const TOMORROW = "2026-10-10T09:00:00.000Z";

const bookings = [
  makeBooking(1, TODAY, "series-a"),
  makeBooking(2, TOMORROW),
  makeBooking(3, TOMORROW, "series-a"),
  makeBooking(4, TOMORROW, "series-b"),
];
const recurringInfo = [makeInfo("series-a"), makeInfo("series-b")];
const data = { bookings, recurringInfo, totalCount: bookings.length } as BookingsGetOutput;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useBookingCalendarData", () => {
  it("keeps one booking per series on the recurring tab and attaches its recurring info", () => {
    const { result } = renderHook(() => useBookingCalendarData({ data, status: "recurring" }));

    expect(result.current).toEqual([
      { type: "data", booking: bookings[0], isToday: true, recurringInfo: recurringInfo[0] },
      { type: "data", booking: bookings[1], isToday: false, recurringInfo: undefined },
      { type: "data", booking: bookings[3], isToday: false, recurringInfo: recurringInfo[1] },
    ]);
  });

  it("keeps every occurrence on the upcoming tab", () => {
    const { result } = renderHook(() => useBookingCalendarData({ data, status: "upcoming" }));

    expect(result.current.map((row) => (row.type === "data" ? row.booking.id : null))).toEqual([1, 2, 3, 4]);
  });

  it("returns no rows without data", () => {
    const { result } = renderHook(() => useBookingCalendarData({ data: undefined, status: "upcoming" }));

    expect(result.current).toEqual([]);
  });
});

describe("useBookingListData", () => {
  it("dedupes the series on the cancelled tab", () => {
    const { result } = renderHook(() =>
      useBookingListData({ data, status: "cancelled", userTimeZone: "UTC" })
    );

    expect(result.current).toEqual([
      { type: "data", booking: bookings[0], isToday: false, recurringInfo: recurringInfo[0] },
      { type: "data", booking: bookings[1], isToday: false, recurringInfo: undefined },
      { type: "data", booking: bookings[3], isToday: false, recurringInfo: recurringInfo[1] },
    ]);
  });

  it("splits the upcoming tab into today and next sections without deduping the series", () => {
    const { result } = renderHook(() =>
      useBookingListData({ data, status: "upcoming", userTimeZone: "UTC" })
    );

    expect(result.current).toEqual([
      { type: "separator", label: "today" },
      { type: "data", booking: bookings[0], isToday: true, recurringInfo: recurringInfo[0] },
      { type: "separator", label: "next" },
      { type: "data", booking: bookings[1], isToday: false, recurringInfo: undefined },
      { type: "data", booking: bookings[2], isToday: false, recurringInfo: recurringInfo[0] },
      { type: "data", booking: bookings[3], isToday: false, recurringInfo: recurringInfo[1] },
    ]);
  });

  it("returns no rows without data", () => {
    const { result } = renderHook(() => useBookingListData({ data: undefined, status: "past" }));

    expect(result.current).toEqual([]);
  });
});
