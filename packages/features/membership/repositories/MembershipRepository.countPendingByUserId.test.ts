import type { PrismaClient } from "@calcom/prisma/client";
import { describe, expect, it, vi } from "vitest";
import { MembershipRepository } from "./MembershipRepository";

vi.mock("@calcom/prisma", () => ({
  default: {},
  prisma: {},
}));

describe("MembershipRepository.countPendingByUserId", () => {
  it("counts the non-organization team memberships the user has not accepted yet", async () => {
    const count = vi.fn().mockResolvedValue(2);
    const repository = new MembershipRepository({ membership: { count } } as unknown as PrismaClient);

    const result = await repository.countPendingByUserId({ userId: 5 });

    expect(result).toBe(2);
    expect(count).toHaveBeenCalledWith({
      where: { userId: 5, accepted: false, team: { isOrganization: false } },
    });
  });
});
