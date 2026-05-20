import { afterEach, describe, expect, it, vi } from "vitest";

import { MembershipRole } from "@calcom/prisma/enums";

const membershipFindUnique = vi.fn();
const membershipUpdate = vi.fn();
const membershipDelete = vi.fn();
const membershipCount = vi.fn();
const tokenFindUnique = vi.fn();
const tokenDelete = vi.fn();
const txMock = vi.fn();

vi.mock("@calcom/prisma", () => ({
  prisma: {
    membership: {
      get findUnique() {
        return membershipFindUnique;
      },
      get update() {
        return membershipUpdate;
      },
      get delete() {
        return membershipDelete;
      },
      get count() {
        return membershipCount;
      },
    },
    verificationToken: {
      get findUnique() {
        return tokenFindUnique;
      },
      get delete() {
        return tokenDelete;
      },
    },
    get $transaction() {
      return txMock;
    },
  },
}));

vi.mock("../permissions", () => ({
  getMembership: vi.fn((userId: number, teamId: number) =>
    membershipFindUnique({ where: { userId_teamId: { userId, teamId } } })
  ),
}));

async function loadHandler() {
  const mod = await import("../acceptOrLeave.handler");
  return mod.acceptOrLeaveHandler;
}

const baseCtx = {
  user: { id: 7, email: "invitee@example.com" } as never,
};

describe("acceptOrLeave (SEC-302-FORK)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    txMock.mockReset();
  });

  describe("accept without token (legitimate in-app accept)", () => {
    it("flips accepted to true when membership exists", async () => {
      membershipFindUnique.mockResolvedValueOnce({ accepted: false, role: MembershipRole.MEMBER });
      const handler = await loadHandler();
      await handler({ ctx: baseCtx, input: { teamId: 1, accept: true } });
      expect(membershipUpdate).toHaveBeenCalledWith({
        where: { userId_teamId: { userId: 7, teamId: 1 } },
        data: { accepted: true },
      });
    });

    it("no-ops when already accepted", async () => {
      membershipFindUnique.mockResolvedValueOnce({ accepted: true, role: MembershipRole.MEMBER });
      const handler = await loadHandler();
      const res = await handler({ ctx: baseCtx, input: { teamId: 1, accept: true } });
      expect(res).toEqual({ ok: true });
      expect(membershipUpdate).not.toHaveBeenCalled();
    });
  });

  describe("accept with token (defense in depth)", () => {
    it("accepts and consumes the token when it matches", async () => {
      membershipFindUnique.mockResolvedValueOnce({ accepted: false, role: MembershipRole.MEMBER });
      tokenFindUnique.mockResolvedValueOnce({
        identifier: "invitee@example.com",
        teamId: 1,
        expires: new Date(Date.now() + 1000 * 60),
      });
      txMock.mockResolvedValueOnce([]);
      const handler = await loadHandler();
      await handler({ ctx: baseCtx, input: { teamId: 1, accept: true, inviteToken: "x".repeat(48) } });
      expect(txMock).toHaveBeenCalledTimes(1);
    });

    it("rejects an expired token", async () => {
      membershipFindUnique.mockResolvedValueOnce({ accepted: false, role: MembershipRole.MEMBER });
      tokenFindUnique.mockResolvedValueOnce({
        identifier: "invitee@example.com",
        teamId: 1,
        expires: new Date(Date.now() - 1000),
      });
      const handler = await loadHandler();
      await expect(
        handler({ ctx: baseCtx, input: { teamId: 1, accept: true, inviteToken: "x".repeat(48) } })
      ).rejects.toThrow(/Invalid or expired/);
      expect(txMock).not.toHaveBeenCalled();
    });

    it("rejects a token for a different team", async () => {
      membershipFindUnique.mockResolvedValueOnce({ accepted: false, role: MembershipRole.MEMBER });
      tokenFindUnique.mockResolvedValueOnce({
        identifier: "invitee@example.com",
        teamId: 99,
        expires: new Date(Date.now() + 60_000),
      });
      const handler = await loadHandler();
      await expect(
        handler({ ctx: baseCtx, input: { teamId: 1, accept: true, inviteToken: "x".repeat(48) } })
      ).rejects.toThrow(/Invalid or expired/);
    });

    it("rejects a token tied to a different email", async () => {
      membershipFindUnique.mockResolvedValueOnce({ accepted: false, role: MembershipRole.MEMBER });
      tokenFindUnique.mockResolvedValueOnce({
        identifier: "someone-else@example.com",
        teamId: 1,
        expires: new Date(Date.now() + 60_000),
      });
      const handler = await loadHandler();
      await expect(
        handler({ ctx: baseCtx, input: { teamId: 1, accept: true, inviteToken: "x".repeat(48) } })
      ).rejects.toThrow(/Invalid or expired/);
    });

    it("rejects a completely unknown token", async () => {
      membershipFindUnique.mockResolvedValueOnce({ accepted: false, role: MembershipRole.MEMBER });
      tokenFindUnique.mockResolvedValueOnce(null);
      const handler = await loadHandler();
      await expect(
        handler({ ctx: baseCtx, input: { teamId: 1, accept: true, inviteToken: "x".repeat(48) } })
      ).rejects.toThrow(/Invalid or expired/);
    });
  });
});
