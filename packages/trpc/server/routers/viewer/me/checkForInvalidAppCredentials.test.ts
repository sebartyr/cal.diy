import { MembershipRole } from "@calcom/prisma/enums";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkInvalidAppCredentials } from "./checkForInvalidAppCredentials";

const { mockGetTeamIdsWithPermission, mockCredentialFindMany } = vi.hoisted(() => ({
  mockGetTeamIdsWithPermission: vi.fn(),
  mockCredentialFindMany: vi.fn(),
}));

vi.mock("@calcom/features/membership/di/TeamRolePermissionService.container", () => ({
  getTeamRolePermissionService: () => ({ getTeamIdsWithPermission: mockGetTeamIdsWithPermission }),
}));

vi.mock("@calcom/prisma", () => ({
  prisma: { credential: { findMany: mockCredentialFindMany } },
}));

vi.mock("@calcom/app-store/utils", () => ({
  getAppFromSlug: vi.fn(async (slug: string) => ({ name: `App ${slug}` })),
}));

describe("checkInvalidAppCredentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes invalid credentials of teams the user administers", async () => {
    mockGetTeamIdsWithPermission.mockResolvedValue([10, 20]);
    mockCredentialFindMany.mockResolvedValue([{ appId: "zoom" }]);

    const result = await checkInvalidAppCredentials({
      ctx: { user: { id: 1 } as NonNullable<TrpcSessionUser> },
    });

    expect(mockGetTeamIdsWithPermission).toHaveBeenCalledWith({
      userId: 1,
      permission: "team.update",
      fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
    });
    expect(mockCredentialFindMany).toHaveBeenCalledWith({
      where: { OR: [{ userId: 1 }, { teamId: { in: [10, 20] } }], invalid: true },
      select: { appId: true },
    });
    expect(result).toEqual([{ slug: "zoom", name: "App zoom" }]);
  });
});
