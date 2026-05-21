import type { Logger } from "tslog";
import { describe, expect, it, vi } from "vitest";

import { getUTCOffsetByTimezone } from "@calcom/lib/dayjs";

import { validateBookingTimeIsNotOutOfBounds } from "../validateBookingTimeIsNotOutOfBounds";

// We don't reach the inner isOutOfBounds branch — the value used in this test
// proves the call passes "now"-equivalent semantics in the bug case and the
// slot date in the fixed case. We assert by spying on getUTCOffsetByTimezone.
vi.mock("@calcom/lib/dayjs", async () => {
  const actual = await vi.importActual<typeof import("@calcom/lib/dayjs")>("@calcom/lib/dayjs");
  return {
    ...actual,
    getUTCOffsetByTimezone: vi.fn(actual.getUTCOffsetByTimezone),
  };
});

const fakeLogger = {
  warn: vi.fn(),
  info: vi.fn(),
} as unknown as Logger<unknown>;

const baseEventType = {
  periodType: "UNLIMITED" as const,
  periodDays: null,
  periodEndDate: null,
  periodStartDate: null,
  periodCountCalendarDays: null,
  minimumBookingNotice: 0,
  eventName: null,
  id: 1,
  title: "Test",
};

describe("validateBookingTimeIsNotOutOfBounds — BUG-003 DST offset at slot date", () => {
  it("passes reqBodyStartTime to getUTCOffsetByTimezone for the booker tz", async () => {
    const mocked = vi.mocked(getUTCOffsetByTimezone);
    mocked.mockClear();

    const slot = "2027-03-28T11:00:00Z"; // a Sunday around CET→CEST flip (future)
    await validateBookingTimeIsNotOutOfBounds(slot, "Europe/Paris", baseEventType, null, fakeLogger);

    const bookerCall = mocked.mock.calls.find((c) => c[0] === "Europe/Paris");
    expect(bookerCall).toBeDefined();
    expect(bookerCall?.[1]).toBe(slot);
  });

  it("passes reqBodyStartTime as the date for the event tz too", async () => {
    const mocked = vi.mocked(getUTCOffsetByTimezone);
    mocked.mockClear();

    const slot = "2027-03-14T07:00:00Z"; // weekend around US DST flip (future)
    await validateBookingTimeIsNotOutOfBounds(
      slot,
      "America/New_York",
      baseEventType,
      "America/Los_Angeles",
      fakeLogger
    );

    const eventCall = mocked.mock.calls.find((c) => c[0] === "America/Los_Angeles");
    expect(eventCall).toBeDefined();
    expect(eventCall?.[1]).toBe(slot);
  });

  it("does not call getUTCOffsetByTimezone for the event tz when it is null", async () => {
    const mocked = vi.mocked(getUTCOffsetByTimezone);
    mocked.mockClear();

    await validateBookingTimeIsNotOutOfBounds(
      "2027-06-01T10:00:00Z",
      "Europe/Paris",
      baseEventType,
      null,
      fakeLogger
    );

    expect(mocked.mock.calls.some((c) => c[0] !== "Europe/Paris")).toBe(false);
  });
});
