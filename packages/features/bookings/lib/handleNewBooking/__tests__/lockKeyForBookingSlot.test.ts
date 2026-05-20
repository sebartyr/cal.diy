import { describe, expect, it } from "vitest";
import { lockKeyForBookingSlot } from "../createBooking";

/**
 * The lock key pair is fed to `pg_advisory_xact_lock(int4, int4)` to
 * serialize concurrent createBooking() calls (BUG-001 fix). These tests
 * pin the key shape — the same (userId, slot) MUST always produce the
 * same key, and concurrent requests for the same slot MUST collide.
 */
describe("lockKeyForBookingSlot", () => {
  it("is stable for the same userId + slot", () => {
    const a = lockKeyForBookingSlot(42, new Date("2026-06-15T10:00:00.000Z"));
    const b = lockKeyForBookingSlot(42, new Date("2026-06-15T10:00:00.000Z"));
    expect(a).toEqual(b);
  });

  it("collides on millisecond drift within the same second (slot granularity = 1s)", () => {
    const a = lockKeyForBookingSlot(42, new Date("2026-06-15T10:00:00.000Z"));
    const b = lockKeyForBookingSlot(42, new Date("2026-06-15T10:00:00.999Z"));
    expect(a).toEqual(b);
  });

  it("differs across users for the same slot", () => {
    const a = lockKeyForBookingSlot(42, new Date("2026-06-15T10:00:00.000Z"));
    const b = lockKeyForBookingSlot(43, new Date("2026-06-15T10:00:00.000Z"));
    expect(a.userPart).not.toBe(b.userPart);
  });

  it("differs across slots for the same user", () => {
    const a = lockKeyForBookingSlot(42, new Date("2026-06-15T10:00:00.000Z"));
    const b = lockKeyForBookingSlot(42, new Date("2026-06-15T10:01:00.000Z"));
    expect(a.slotPart).not.toBe(b.slotPart);
  });

  it("stays within int4 positive range (no Postgres overflow at lock time)", () => {
    const cases = [
      new Date("2026-06-15T10:00:00.000Z"),
      new Date("2099-12-31T23:59:59.000Z"), // past int4 epoch range, still safe after mask
      new Date("2038-01-19T03:14:08.000Z"),
    ];
    for (const d of cases) {
      const k = lockKeyForBookingSlot(99999, d);
      expect(k.slotPart).toBeGreaterThanOrEqual(0);
      expect(k.slotPart).toBeLessThanOrEqual(0x7fffffff);
    }
  });
});
