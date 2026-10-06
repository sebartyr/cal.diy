import type { PrismaClient } from "@calcom/prisma/client";
import { MembershipRole } from "@calcom/prisma/enums";
import { describe, expect, it, vi } from "vitest";
import { MembershipRepository } from "./MembershipRepository";

vi.mock("@calcom/prisma", () => ({
  default: {},
  prisma: {},
}));

function buildRepository(findFirstResult: { id: number } | null) {
  const findFirst = vi.fn().mockResolvedValue(findFirstResult);
  const prismaClient = { membership: { findFirst } } as unknown as PrismaClient;
  return { repository: new MembershipRepository(prismaClient), findFirst };
}

describe("MembershipRepository.hasAcceptedMembershipWithRoles", () => {
  it("queries only accepted memberships with the requested roles", async () => {
    const { repository, findFirst } = buildRepository({ id: 1 });

    const result = await repository.hasAcceptedMembershipWithRoles({
      userId: 5,
      teamId: 9,
      roles: [MembershipRole.ADMIN, MembershipRole.OWNER],
    });

    expect(result).toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        userId: 5,
        teamId: 9,
        accepted: true,
        role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
      },
      select: { id: true },
    });
  });

  it("returns false when no matching membership exists", async () => {
    const { repository } = buildRepository(null);

    const result = await repository.hasAcceptedMembershipWithRoles({
      userId: 5,
      teamId: 9,
      roles: [MembershipRole.OWNER],
    });

    expect(result).toBe(false);
  });
});
