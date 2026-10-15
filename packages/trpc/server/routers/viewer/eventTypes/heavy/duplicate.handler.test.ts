import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { TRPCError } from "@trpc/server";

import { UserPermissionRole } from "@calcom/prisma/enums";

import { duplicateHandler } from "./duplicate.handler";

vi.mock("@calcom/prisma", () => ({
  default: prismaMock,
}));
vi.mock("@calcom/features/eventtypes/repositories/eventTypeRepository");

describe("duplicateHandler", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = { user: { id: 1, profile: { id: 1 } } } as any;
  const input = {
    id: 123,
    slug: "test-event",
    title: "Test",
    description: "Test",
    length: 30,
    teamId: null,
  };
  const eventType = { id: 123, userId: 1, teamId: null, users: [{ id: 1 }] };
  const teamEventType = { id: 123, userId: 2, teamId: 5, team: { id: 5 }, users: [{ id: 2 }] };

  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.eventType.findUnique.mockResolvedValue(eventType);
  });

  it("should throw INTERNAL_SERVER_ERROR in case of unique constraint violation", async () => {
    const { EventTypeRepository } = await import(
      "@calcom/features/eventtypes/repositories/eventTypeRepository"
    );
    vi.mocked(EventTypeRepository).mockImplementation(function () {
      return {
        create: vi.fn().mockRejectedValue(
          new PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "mockedVersion",
          })
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    });

    await expect(duplicateHandler({ ctx, input })).rejects.toThrow(
      new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Error duplicating event type PrismaClientKnownRequestError: Unique constraint failed",
      })
    );
  });
  it("should deny a non-member duplicating a team event type", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue(teamEventType);
    prismaMock.membership.findUnique.mockResolvedValue(null);

    await expect(duplicateHandler({ ctx, input })).rejects.toThrow(
      new TRPCError({ code: "FORBIDDEN" })
    );
  });

  it("should let a system admin duplicate a team event type they are not a member of", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue({
      ...teamEventType,
      customInputs: [],
      hosts: [],
      hashedLink: [],
      webhooks: [],
      destinationCalendar: null,
      metadata: null,
      bookingFields: null,
      rrSegmentQueryValue: null,
    });
    prismaMock.membership.findUnique.mockResolvedValue(null);

    const create = vi.fn().mockResolvedValue({ id: 456, slug: "test-event" });
    const { EventTypeRepository } = await import(
      "@calcom/features/eventtypes/repositories/eventTypeRepository"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(EventTypeRepository).mockImplementation(function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { create } as any;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminCtx = { user: { id: 1, profile: { id: 1 }, role: UserPermissionRole.ADMIN } } as any;
    await duplicateHandler({ ctx: adminCtx, input });

    expect(create).toHaveBeenCalled();
    expect(prismaMock.membership.findUnique).not.toHaveBeenCalled();
  });
});
