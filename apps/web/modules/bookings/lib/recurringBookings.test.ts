import { describe, expect, it } from "vitest";
import { buildRecurringInfoMap, dedupeRecurringSeries } from "./recurringBookings";

const booking = (id: number, recurringEventId: string | null = null) => ({ id, recurringEventId });

describe("buildRecurringInfoMap", () => {
  it("indexes the infos by recurringEventId and skips the ones without a series", () => {
    const first = { recurringEventId: "a", count: 2 };
    const second = { recurringEventId: "b", count: 3 };
    const map = buildRecurringInfoMap([first, { recurringEventId: null, count: 1 }, second]);

    expect(map.size).toBe(2);
    expect(map.get("a")).toBe(first);
    expect(map.get("b")).toBe(second);
  });

  it("returns an empty map without infos", () => {
    expect(buildRecurringInfoMap(undefined).size).toBe(0);
  });
});

describe("dedupeRecurringSeries", () => {
  const bookings = [
    booking(1, "a"),
    booking(2),
    booking(3, "a"),
    booking(4, "b"),
    booking(5, "b"),
    booking(6),
  ];

  it.each([
    "recurring",
    "unconfirmed",
    "cancelled",
  ] as const)("keeps the first occurrence of each series on the %s tab", (status) => {
    expect(dedupeRecurringSeries(bookings, status).map(({ id }) => id)).toEqual([1, 2, 4, 6]);
  });

  it.each(["upcoming", "past"] as const)("keeps every occurrence on the %s tab", (status) => {
    const result = dedupeRecurringSeries(bookings, status);
    expect(result).toEqual(bookings);
    expect(result).not.toBe(bookings);
  });
});
