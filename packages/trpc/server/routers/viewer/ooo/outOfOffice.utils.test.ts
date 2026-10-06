import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAdminForUser } from "./outOfOffice.utils";

const { mockGetTeamIdsWithPermission, mockMembershipFindFirst } = vi.hoisted(() => ({
  mockGetTeamIdsWithPermission: vi.fn(),
  mockMembershipFindFirst: vi.fn(),
}));

vi.mock("@calcom/features/membership/di/TeamRolePermissionService.container", () => ({
  getTeamRolePermissionService: () => ({ getTeamIdsWithPermission: mockGetTeamIdsWithPermission }),
}));

vi.mock("@calcom/prisma", () => ({
  default: { membership: { findFirst: mockMembershipFindFirst } },
}));

describe("isAdminForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false without querying members when the caller administers no team", async () => {
    mockGetTeamIdsWithPermission.mockResolvedValue([]);

    await expect(isAdminForUser(1, 2)).resolves.toBe(false);
    expect(mockMembershipFindFirst).not.toHaveBeenCalled();
  });

  it("returns true when the member belongs to a team the caller administers", async () => {
    mockGetTeamIdsWithPermission.mockResolvedValue([10]);
    mockMembershipFindFirst.mockResolvedValue({ id: 99 });

    await expect(isAdminForUser(1, 2)).resolves.toBe(true);
    expect(mockGetTeamIdsWithPermission).toHaveBeenCalledWith({
      userId: 1,
      permission: "ooo.update",
      fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
    });
    expect(mockMembershipFindFirst).toHaveBeenCalledWith({
      where: { userId: 2, accepted: true, teamId: { in: [10] } },
      select: { id: true },
    });
  });

  it("returns false when the member is not in any of the caller's administered teams", async () => {
    mockGetTeamIdsWithPermission.mockResolvedValue([10]);
    mockMembershipFindFirst.mockResolvedValue(null);

    await expect(isAdminForUser(1, 2)).resolves.toBe(false);
  });
});
