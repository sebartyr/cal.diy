import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
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

function buildRepository(teams: { id: number }[]) {
  const findMany = vi.fn().mockResolvedValue(teams);
  const prismaClient = { team: { findMany } } as unknown as PrismaClient;
  return { repository: new UserRepository(prismaClient), findMany };
}

describe("UserRepository.isAdminOfTeamOrParentOrg", () => {
  it("only counts accepted ADMIN/OWNER memberships on the team or its parent org", async () => {
    const { repository, findMany } = buildRepository([{ id: 7 }]);

    const result = await repository.isAdminOfTeamOrParentOrg({ userId: 3, teamId: 7 });

    const membershipQuery = {
      members: {
        some: {
          userId: 3,
          accepted: true,
          role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
        },
      },
    };
    expect(result).toBe(true);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        id: 7,
        OR: [membershipQuery, { parent: membershipQuery }],
      },
      select: { id: true },
    });
  });

  it("returns false when no team matches", async () => {
    const { repository } = buildRepository([]);

    await expect(repository.isAdminOfTeamOrParentOrg({ userId: 3, teamId: 7 })).resolves.toBe(false);
  });
});
