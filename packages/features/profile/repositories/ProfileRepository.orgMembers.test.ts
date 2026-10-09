import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    profile: { findFirst: vi.fn(), findUnique: vi.fn() },
    membership: { findFirst: vi.fn() },
  },
}));

vi.mock("@calcom/prisma", () => ({ default: prismaMock, prisma: prismaMock }));

import { ProfileRepository } from "./ProfileRepository";

const ORG_ID = 10;
const MEMBER_ID = 1;
const ADMIN_ID = 2;
const MEMBER_PROFILE_UID = "member-profile-uid";
const ADMIN_PROFILE_UID = "admin-profile-uid";

const profiles = [
  { id: 101, uid: MEMBER_PROFILE_UID, userId: MEMBER_ID },
  { id: 102, uid: ADMIN_PROFILE_UID, userId: ADMIN_ID },
];

const memberships = [
  { id: 1, teamId: ORG_ID, userId: MEMBER_ID, accepted: true, role: MembershipRole.MEMBER },
  { id: 2, teamId: ORG_ID, userId: ADMIN_ID, accepted: true, role: MembershipRole.ADMIN },
];

type MembersWhere = {
  accepted?: boolean;
  userId?: number;
  user?: { profiles?: { some?: { uid?: string } } };
};

// Applies the members `where` the repository sends, so the test fails if the filter is dropped.
function applyMembersWhere(where: MembersWhere) {
  return memberships.filter((membership) => {
    if (where.accepted !== undefined && membership.accepted !== where.accepted) return false;
    if (where.userId !== undefined && membership.userId !== where.userId) return false;
    const uid = where.user?.profiles?.some?.uid;
    if (uid !== undefined) {
      return profiles.some((profile) => profile.uid === uid && profile.userId === membership.userId);
    }
    return true;
  });
}

const isOrgAdmin = (members: { role: string }[]) =>
  members.some((member) => member.role === MembershipRole.ADMIN || member.role === MembershipRole.OWNER);

describe("ProfileRepository.findByUpIdWithAuth - organization members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.profile.findFirst.mockImplementation(
      async (args: {
        where: { uid: string };
        include: { organization: { select: { members: { where: MembersWhere } } } };
      }) => {
        const profile = profiles.find((p) => p.uid === args.where.uid);
        if (!profile) return null;
        return {
          ...profile,
          organizationId: ORG_ID,
          username: `user-${profile.userId}`,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          updatedAt: new Date("2024-01-01T00:00:00.000Z"),
          user: {
            id: profile.userId,
            name: null,
            avatarUrl: null,
            username: `user-${profile.userId}`,
            email: `user-${profile.userId}@example.com`,
            locale: "en",
            defaultScheduleId: null,
            bufferTime: 0,
            isPlatformManaged: false,
          },
          organization: {
            id: ORG_ID,
            slug: "org",
            name: "Org",
            metadata: {},
            isPlatform: false,
            members: applyMembersWhere(args.include.organization.select.members.where),
          },
        };
      }
    );
    prismaMock.membership.findFirst.mockResolvedValue({ id: 1 });
  });

  it("does not make a plain member an org admin when the org has an admin", async () => {
    const result = await ProfileRepository.findByUpIdWithAuth(`prof-${MEMBER_PROFILE_UID}`, MEMBER_ID);

    const members = result?.organization?.members ?? [];
    expect(members).toEqual([expect.objectContaining({ userId: MEMBER_ID, role: MembershipRole.MEMBER })]);
    expect(isOrgAdmin(members)).toBe(false);
  });

  it("keeps an actual org admin as admin", async () => {
    const result = await ProfileRepository.findByUpIdWithAuth(`prof-${ADMIN_PROFILE_UID}`, ADMIN_ID);

    const members = result?.organization?.members ?? [];
    expect(members).toEqual([expect.objectContaining({ userId: ADMIN_ID, role: MembershipRole.ADMIN })]);
    expect(isOrgAdmin(members)).toBe(true);
  });

  it("checks profile ownership without re-reading the profile or the membership", async () => {
    const result = await ProfileRepository.findByUpIdWithAuth(`prof-${MEMBER_PROFILE_UID}`, MEMBER_ID);

    expect(result?.id).toBe(101);
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.membership.findFirst).not.toHaveBeenCalled();
  });

  it("falls back to the org membership check when the requester does not own the profile", async () => {
    const result = await ProfileRepository.findByUpIdWithAuth(`prof-${MEMBER_PROFILE_UID}`, ADMIN_ID);

    expect(result?.id).toBe(101);
    expect(prismaMock.membership.findFirst).toHaveBeenCalledWith({
      where: { userId: ADMIN_ID, teamId: ORG_ID, accepted: true },
      select: { id: true },
    });
  });

  it("denies access when the requester neither owns the profile nor belongs to the org", async () => {
    prismaMock.membership.findFirst.mockResolvedValue(null);

    const result = await ProfileRepository.findByUpIdWithAuth(`prof-${MEMBER_PROFILE_UID}`, 999);

    expect(result).toBeNull();
  });
});
