import type { PrismaClient } from "@calcom/prisma/client";
import { MembershipRole } from "@calcom/prisma/enums";
import { describe, expect, it, vi } from "vitest";
import { MembershipRepository } from "./MembershipRepository";

vi.mock("@calcom/prisma", () => ({
  default: {},
  prisma: {},
}));

describe("MembershipRepository.listAcceptedTeamIdsWithRoles", () => {
  it("returns the team ids of accepted memberships holding one of the requested roles", async () => {
    const findMany = vi.fn().mockResolvedValue([{ teamId: 3 }, { teamId: 7 }]);
    const repository = new MembershipRepository({ membership: { findMany } } as unknown as PrismaClient);

    const result = await repository.listAcceptedTeamIdsWithRoles({
      userId: 5,
      roles: [MembershipRole.ADMIN, MembershipRole.OWNER],
    });

    expect(result).toEqual([3, 7]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: 5,
        accepted: true,
        role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
      },
      select: { teamId: true },
    });
  });
});
