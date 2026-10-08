import { MembershipRole } from "@calcom/prisma/enums";
import { afterEach, describe, expect, it, vi } from "vitest";

const teamFindUnique = vi.fn();
const membershipFindMany = vi.fn();
const requireMember = vi.fn();

vi.mock("@calcom/prisma", () => ({
  prisma: {
    team: {
      get findUnique() {
        return teamFindUnique;
      },
    },
    membership: {
      get findMany() {
        return membershipFindMany;
      },
    },
  },
}));

vi.mock("../permissions", () => ({
  get requireMember() {
    return requireMember;
  },
  ROLE_RANK: { OWNER: 3, ADMIN: 2, MEMBER: 1 },
}));

import { listMembersHandler } from "../listMembers.handler";

const ctx = { user: { id: 1 } as never };

const row = (id: number, accepted: boolean) => ({
  id,
  role: MembershipRole.MEMBER,
  accepted,
  user: {
    id: id * 10,
    name: `User ${id}`,
    username: `user${id}`,
    email: `user${id}@example.com`,
    avatarUrl: null,
    timeZone: "Europe/Paris",
  },
});

describe("listMembersHandler", () => {
  afterEach(() => vi.clearAllMocks());

  it("hides pending invites and contact details from a MEMBER of a private team", async () => {
    requireMember.mockResolvedValueOnce({ role: MembershipRole.MEMBER });
    teamFindUnique.mockResolvedValueOnce({ isPrivate: true });
    membershipFindMany.mockResolvedValueOnce([row(1, true)]);

    const res = await listMembersHandler({ ctx, input: { teamId: 5 } });

    expect(membershipFindMany.mock.calls[0][0].where).toEqual({ teamId: 5, accepted: true });
    expect(res[0].user.email).toBeNull();
    expect(res[0].user.timeZone).toBeNull();
    expect(res[0].user.name).toBe("User 1");
  });

  it("returns pending invites and contact details to an ADMIN of a private team", async () => {
    requireMember.mockResolvedValueOnce({ role: MembershipRole.ADMIN });
    teamFindUnique.mockResolvedValueOnce({ isPrivate: true });
    membershipFindMany.mockResolvedValueOnce([row(1, true), row(2, false)]);

    const res = await listMembersHandler({ ctx, input: { teamId: 5 } });

    expect(membershipFindMany.mock.calls[0][0].where).toEqual({ teamId: 5 });
    expect(res).toHaveLength(2);
    expect(res[1].user.email).toBe("user2@example.com");
    expect(res[1].user.timeZone).toBe("Europe/Paris");
  });

  it("returns everything to a MEMBER of a public team", async () => {
    requireMember.mockResolvedValueOnce({ role: MembershipRole.MEMBER });
    teamFindUnique.mockResolvedValueOnce({ isPrivate: false });
    membershipFindMany.mockResolvedValueOnce([row(1, true), row(2, false)]);

    const res = await listMembersHandler({ ctx, input: { teamId: 5 } });

    expect(membershipFindMany.mock.calls[0][0].where).toEqual({ teamId: 5 });
    expect(res[0].user.email).toBe("user1@example.com");
  });
});
