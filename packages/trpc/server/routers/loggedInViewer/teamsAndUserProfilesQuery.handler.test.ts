import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { teamsAndUserProfilesQuery } from "./teamsAndUserProfilesQuery.handler";

const { mockCheckPermission } = vi.hoisted(() => ({ mockCheckPermission: vi.fn() }));

vi.mock("@calcom/features/membership/di/TeamRolePermissionService.container", () => ({
  getTeamRolePermissionService: () => ({ checkPermission: mockCheckPermission }),
}));

function membership(teamId: number, role: MembershipRole) {
  return {
    role,
    team: {
      id: teamId,
      isOrganization: false,
      logoUrl: null,
      name: `Team ${teamId}`,
      slug: `team-${teamId}`,
      metadata: null,
      parentId: null,
      parent: null,
      members: [],
    },
  };
}

describe("teamsAndUserProfilesQuery", () => {
  const findUnique = vi.fn();
  const ctx = {
    user: { id: 1 } as NonNullable<TrpcSessionUser>,
    prisma: { user: { findUnique } } as unknown as PrismaClient,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({
      id: 1,
      avatarUrl: null,
      username: "member",
      name: "Member",
      teams: [membership(10, MembershipRole.MEMBER), membership(20, MembershipRole.ADMIN)],
    });
  });

  it("drops teams where the user lacks one of the requested roles", async () => {
    mockCheckPermission.mockImplementation(async ({ teamId }: { teamId: number }) => teamId === 20);

    const result = await teamsAndUserProfilesQuery({
      ctx,
      input: {
        withPermission: {
          permission: "eventType.create",
          fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
        },
      },
    });

    expect(result.map((profile) => profile.teamId)).toEqual([null, 20]);
    expect(result[1].readOnly).toBe(false);
    expect(mockCheckPermission).toHaveBeenCalledWith({
      userId: 1,
      teamId: 10,
      permission: "eventType.create",
      fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
    });
  });

  it("ignores fallback roles that are not membership roles", async () => {
    mockCheckPermission.mockResolvedValue(false);

    const result = await teamsAndUserProfilesQuery({
      ctx,
      input: { withPermission: { permission: "eventType.create", fallbackRoles: ["SUPERUSER"] } },
    });

    expect(result.map((profile) => profile.teamId)).toEqual([null]);
    expect(mockCheckPermission).toHaveBeenCalledWith(expect.objectContaining({ fallbackRoles: [] }));
  });
});
