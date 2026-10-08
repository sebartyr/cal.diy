import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamRolePermissionService } from "./TeamRolePermissionService";

describe("TeamRolePermissionService", () => {
  const hasAcceptedMembershipWithRoles = vi.fn();
  const listAcceptedTeamIdsWithRoles = vi.fn();
  let service: TeamRolePermissionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TeamRolePermissionService({ hasAcceptedMembershipWithRoles, listAcceptedTeamIdsWithRoles });
  });

  describe("getTeamIdsWithPermission", () => {
    it("returns the teams where the user holds one of the fallback roles", async () => {
      listAcceptedTeamIdsWithRoles.mockResolvedValue([10, 20]);

      const result = await service.getTeamIdsWithPermission({
        userId: 1,
        permission: "booking.read",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });

      expect(result).toEqual([10, 20]);
      expect(listAcceptedTeamIdsWithRoles).toHaveBeenCalledWith({
        userId: 1,
        roles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });
    });

    it("returns an empty list without querying when no fallback role is allowed", async () => {
      const result = await service.getTeamIdsWithPermission({
        userId: 1,
        permission: "booking.read",
        fallbackRoles: [],
      });

      expect(result).toEqual([]);
      expect(listAcceptedTeamIdsWithRoles).not.toHaveBeenCalled();
    });
  });

  it("returns true when the user has an accepted membership with one of the fallback roles", async () => {
    hasAcceptedMembershipWithRoles.mockResolvedValue(true);

    const result = await service.checkPermission({
      userId: 1,
      teamId: 10,
      permission: "booking.readTeamBookings",
      fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
    });

    expect(result).toBe(true);
    expect(hasAcceptedMembershipWithRoles).toHaveBeenCalledWith({
      userId: 1,
      teamId: 10,
      roles: [MembershipRole.ADMIN, MembershipRole.OWNER],
    });
  });

  it("returns false when the repository finds no matching membership", async () => {
    hasAcceptedMembershipWithRoles.mockResolvedValue(false);

    const result = await service.checkPermission({
      userId: 1,
      teamId: 10,
      permission: "booking.readTeamBookings",
      fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
    });

    expect(result).toBe(false);
  });

  it.each([null, undefined, 0])("returns false without querying when teamId is %s", async (teamId) => {
    const result = await service.checkPermission({
      userId: 1,
      teamId,
      permission: "booking.readTeamBookings",
      fallbackRoles: [MembershipRole.ADMIN],
    });

    expect(result).toBe(false);
    expect(hasAcceptedMembershipWithRoles).not.toHaveBeenCalled();
  });

  it("returns false without querying when no fallback role is allowed", async () => {
    const result = await service.checkPermission({
      userId: 1,
      teamId: 10,
      permission: "booking.readTeamBookings",
      fallbackRoles: [],
    });

    expect(result).toBe(false);
    expect(hasAcceptedMembershipWithRoles).not.toHaveBeenCalled();
  });
});
