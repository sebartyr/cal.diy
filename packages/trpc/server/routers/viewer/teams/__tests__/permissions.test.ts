import { beforeEach, describe, expect, it, vi } from "vitest";

import { MembershipRole, UserPermissionRole } from "@calcom/prisma/enums";

const membershipFindUnique = vi.fn();

vi.mock("@calcom/prisma", () => ({
  prisma: {
    membership: { findUnique: (args: unknown) => membershipFindUnique(args) },
  },
}));

import { requireMember } from "../permissions";

beforeEach(() => {
  membershipFindUnique.mockReset();
});

describe("requireMember — BUG-102-FORK synthetic admin shape", () => {
  it("returns a synthetic membership with id=null for a system admin without a real membership", async () => {
    membershipFindUnique.mockResolvedValueOnce(null);
    const m = await requireMember(7, 42, MembershipRole.MEMBER, { role: UserPermissionRole.ADMIN });
    expect(m).toBeTruthy();
    expect(m.id).toBeNull();
    expect("isSyntheticAdmin" in m && m.isSyntheticAdmin).toBe(true);
    expect(m.role).toBe(MembershipRole.OWNER);
  });

  it("never returns id=-1 (the legacy synthetic value)", async () => {
    membershipFindUnique.mockResolvedValueOnce(null);
    const m = await requireMember(7, 42, MembershipRole.OWNER, { role: UserPermissionRole.ADMIN });
    expect(m.id).not.toBe(-1);
  });

  it("returns the real membership for an admin who is also a real member, with role mirrored to OWNER", async () => {
    membershipFindUnique.mockResolvedValueOnce({
      id: 99,
      userId: 7,
      teamId: 42,
      role: MembershipRole.MEMBER,
      accepted: true,
      disableImpersonation: false,
      createdAt: new Date(),
      customRoleId: null,
    });
    const m = await requireMember(7, 42, MembershipRole.OWNER, { role: UserPermissionRole.ADMIN });
    expect(m.id).toBe(99);
    expect(m.role).toBe(MembershipRole.OWNER);
  });

  it("rejects a non-admin user without any membership", async () => {
    membershipFindUnique.mockResolvedValueOnce(null);
    await expect(requireMember(7, 42)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a non-admin user whose membership is unaccepted", async () => {
    membershipFindUnique.mockResolvedValueOnce({
      id: 1,
      userId: 7,
      teamId: 42,
      role: MembershipRole.OWNER,
      accepted: false,
      disableImpersonation: false,
      createdAt: new Date(),
      customRoleId: null,
    });
    await expect(requireMember(7, 42)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects when role rank is below required min", async () => {
    membershipFindUnique.mockResolvedValueOnce({
      id: 1,
      userId: 7,
      teamId: 42,
      role: MembershipRole.MEMBER,
      accepted: true,
      disableImpersonation: false,
      createdAt: new Date(),
      customRoleId: null,
    });
    await expect(requireMember(7, 42, MembershipRole.ADMIN)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
