import { describe, expect, it } from "vitest";
import { buildBookingIdempotencyKey } from "../booking-idempotency-key";

/**
 * BUG-013 — the previous implementation generated an idempotency key only
 * for ACCEPTED bookings, leaving PENDING (requiresConfirmation) wide open
 * to retry duplicates. This file pins the key contract:
 *
 * - same (start, end, userId)              → same key                (ACCEPTED path)
 * - reassignedById is folded in            → key changes when set
 * - bookerEmail is folded in               → distinct attendees on the
 *                                            same PENDING slot get
 *                                            distinct keys (legitimate
 *                                            queue), but a same-email
 *                                            retry collides
 */
describe("buildBookingIdempotencyKey", () => {
  const baseACCEPTED = {
    startTime: new Date("2026-06-15T10:00:00Z"),
    endTime: new Date("2026-06-15T10:30:00Z"),
    userId: 42,
  };

  it("is stable for identical inputs", () => {
    expect(buildBookingIdempotencyKey(baseACCEPTED)).toBe(buildBookingIdempotencyKey(baseACCEPTED));
  });

  it("differs when userId differs (different organizer)", () => {
    const a = buildBookingIdempotencyKey(baseACCEPTED);
    const b = buildBookingIdempotencyKey({ ...baseACCEPTED, userId: 43 });
    expect(a).not.toBe(b);
  });

  it("differs when startTime differs", () => {
    const a = buildBookingIdempotencyKey(baseACCEPTED);
    const b = buildBookingIdempotencyKey({
      ...baseACCEPTED,
      startTime: new Date("2026-06-15T10:30:00Z"),
    });
    expect(a).not.toBe(b);
  });

  it("differs when reassignedById is set", () => {
    const a = buildBookingIdempotencyKey(baseACCEPTED);
    const b = buildBookingIdempotencyKey({ ...baseACCEPTED, reassignedById: 7 });
    expect(a).not.toBe(b);
  });

  it("PENDING with bookerEmail differs from ACCEPTED key (BUG-013)", () => {
    const accepted = buildBookingIdempotencyKey(baseACCEPTED);
    const pending = buildBookingIdempotencyKey({
      ...baseACCEPTED,
      bookerEmail: "alice@example.com",
    });
    expect(accepted).not.toBe(pending);
  });

  it("PENDING — distinct booker emails on the same slot produce distinct keys", () => {
    const a = buildBookingIdempotencyKey({ ...baseACCEPTED, bookerEmail: "alice@example.com" });
    const b = buildBookingIdempotencyKey({ ...baseACCEPTED, bookerEmail: "bob@example.com" });
    expect(a).not.toBe(b);
  });

  it("PENDING — same booker email on the same slot produces the same key (blocks retries)", () => {
    const a = buildBookingIdempotencyKey({ ...baseACCEPTED, bookerEmail: "alice@example.com" });
    const b = buildBookingIdempotencyKey({ ...baseACCEPTED, bookerEmail: "alice@example.com" });
    expect(a).toBe(b);
  });

  it("PENDING — booker email is case-insensitive", () => {
    const a = buildBookingIdempotencyKey({ ...baseACCEPTED, bookerEmail: "Alice@Example.com" });
    const b = buildBookingIdempotencyKey({ ...baseACCEPTED, bookerEmail: "alice@example.com" });
    expect(a).toBe(b);
  });
});
