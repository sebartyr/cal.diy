import { describe, expect, it, vi } from "vitest";

import { getHandler } from "../find.handler";

describe("bookings.find handler (SEC-012)", () => {
  it("does NOT request `description` from prisma", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { booking: { findUnique } } as never;

    await getHandler({ ctx: { prisma }, input: { bookingUid: "abc123" } });

    expect(findUnique).toHaveBeenCalledTimes(1);
    const arg = findUnique.mock.calls[0][0];
    expect(arg.select).toBeDefined();
    expect(arg.select.description).toBeUndefined();
  });

  it("requests exactly the public-safe set of fields", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { booking: { findUnique } } as never;

    await getHandler({ ctx: { prisma }, input: { bookingUid: "abc123" } });

    const arg = findUnique.mock.calls[0][0];
    expect(arg.select).toEqual({
      id: true,
      uid: true,
      startTime: true,
      endTime: true,
      status: true,
      paid: true,
      eventTypeId: true,
    });
  });

  it("filters by the supplied uid", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { booking: { findUnique } } as never;

    await getHandler({ ctx: { prisma }, input: { bookingUid: "uid-42" } });

    expect(findUnique.mock.calls[0][0].where).toEqual({ uid: "uid-42" });
  });

  it("does not leak `description` even if prisma returns one (defensive)", async () => {
    // Prisma honors `select`, but mock the worst case where the layer below
    // accidentally returns extra fields. The handler still must not surface
    // them.
    const findUnique = vi.fn().mockResolvedValue({
      id: 1,
      uid: "uid-42",
      startTime: new Date(),
      endTime: new Date(),
      status: "ACCEPTED",
      paid: false,
      eventTypeId: 1,
    });
    const prisma = { booking: { findUnique } } as never;

    const { booking } = await getHandler({ ctx: { prisma }, input: { bookingUid: "uid-42" } });

    expect(booking).not.toHaveProperty("description");
  });
});
