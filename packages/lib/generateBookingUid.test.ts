import { describe, expect, it, vi } from "vitest";
import { generateBookingUid } from "./generateBookingUid";

describe("generateBookingUid", () => {
  it("keeps the short-uuid format of existing booking uids", () => {
    expect(generateBookingUid()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{21,22}$/);
  });

  it("returns different uids for bookings created in the same millisecond", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T10:00:00.000Z"));
    try {
      expect(generateBookingUid()).not.toBe(generateBookingUid());
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not repeat over many generations", () => {
    const uids = new Set(Array.from({ length: 10_000 }, () => generateBookingUid()));
    expect(uids.size).toBe(10_000);
  });
});
