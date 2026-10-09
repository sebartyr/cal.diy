import type { PrismaClient } from "@calcom/prisma";
import { describe, expect, it, vi } from "vitest";
import { UserRepository } from "./UserRepository";

vi.mock("@calcom/prisma", () => ({
  default: {},
  prisma: {},
}));

vi.mock("@calcom/app-store/delegationCredential", () => ({
  enrichHostsWithDelegationCredentials: vi.fn(),
  getUsersCredentialsIncludeServiceAccountKey: vi.fn(),
  getCredentialForSelectedCalendar: vi.fn(),
}));

describe("UserRepository.getUserStats", () => {
  it("counts team event types in the database instead of loading their ids", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      _count: { bookings: 3, selectedCalendars: 1, teams: 2, eventTypes: 4 },
      teams: [{ team: { _count: { eventTypes: 5 } } }, { team: { _count: { eventTypes: 0 } } }],
    });
    const prismaClient = { user: { findUnique } } as unknown as PrismaClient;

    const stats = await new UserRepository(prismaClient).getUserStats({ userId: 1 });

    expect(findUnique.mock.calls[0][0].select.teams).toEqual({
      select: { team: { select: { _count: { select: { eventTypes: true } } } } },
    });
    expect(stats).toEqual({
      _count: { bookings: 3, userLevelSelectedCalendars: 1, teams: 2, eventTypes: 4 },
      teams: [{ team: { _count: { eventTypes: 5 } } }, { team: { _count: { eventTypes: 0 } } }],
    });
  });

  it("returns null for an unknown user", async () => {
    const prismaClient = { user: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as PrismaClient;

    await expect(new UserRepository(prismaClient).getUserStats({ userId: 1 })).resolves.toBeNull();
  });
});
