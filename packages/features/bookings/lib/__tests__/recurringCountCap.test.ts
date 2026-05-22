import { describe, expect, it } from "vitest";

import { recurringEventType, RECURRING_EVENT_MAX_COUNT } from "@calcom/prisma/zod-utils";
import { Frequency } from "@calcom/prisma/zod-utils";

import { extendedBookingCreateBody, RECURRING_BOOKING_MAX_COUNT } from "../bookingCreateBodySchema";

describe("BUG-005 — recurring count cap", () => {
  describe("RECURRING_BOOKING_MAX_COUNT", () => {
    it("is 52", () => {
      expect(RECURRING_BOOKING_MAX_COUNT).toBe(52);
    });

    it("matches the event-type level cap", () => {
      expect(RECURRING_BOOKING_MAX_COUNT).toBe(RECURRING_EVENT_MAX_COUNT);
    });
  });

  describe("booking-create body schema", () => {
    const baseBody = {
      start: "2026-06-01T10:00:00Z",
      end: "2026-06-01T11:00:00Z",
      eventTypeId: 1,
      eventTypeSlug: "x",
      timeZone: "UTC",
      language: "en",
      user: "x",
      metadata: {},
      hasHashedBookingLink: false,
      responses: {},
    };

    it("accepts recurringCount = 52", () => {
      const res = extendedBookingCreateBody.safeParse({ ...baseBody, recurringCount: 52 });
      expect(res.success).toBe(true);
    });

    it("rejects recurringCount = 53", () => {
      const res = extendedBookingCreateBody.safeParse({ ...baseBody, recurringCount: 53 });
      expect(res.success).toBe(false);
    });

    it("rejects recurringCount = 9999", () => {
      const res = extendedBookingCreateBody.safeParse({ ...baseBody, recurringCount: 9999 });
      expect(res.success).toBe(false);
    });

    it("rejects recurringCount = 0", () => {
      const res = extendedBookingCreateBody.safeParse({ ...baseBody, recurringCount: 0 });
      expect(res.success).toBe(false);
    });

    it("accepts no recurringCount (optional)", () => {
      const res = extendedBookingCreateBody.safeParse(baseBody);
      expect(res.success).toBe(true);
    });
  });

  describe("recurringEventType schema (event-type metadata)", () => {
    const base = { interval: 1, freq: Frequency.WEEKLY };

    it("accepts count = 52", () => {
      const res = recurringEventType.safeParse({ ...base, count: 52 });
      expect(res.success).toBe(true);
    });

    it("rejects count = 53", () => {
      const res = recurringEventType.safeParse({ ...base, count: 53 });
      expect(res.success).toBe(false);
    });

    it("rejects count = 100000", () => {
      const res = recurringEventType.safeParse({ ...base, count: 100000 });
      expect(res.success).toBe(false);
    });
  });
});
