import { TRPCError } from "@trpc/server";

import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

import { getMembership } from "./permissions";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: {
    teamId: number;
    accept: boolean;
    /**
     * SEC-302-FORK: optional invite token issued by `inviteMember`. When
     * present, we verify it matches a VerificationToken row tied to this
     * user's email + team and consume it on accept. Tokenless accept is
     * still allowed (legitimate flow: user already logged in, accepts
     * from in-app team list) — the token path is the belt-and-suspenders
     * defense against scenarios where the session belongs to an attacker
     * who is *also* on a list of pending invitees.
     */
    inviteToken?: string;
  };
};

export async function acceptOrLeaveHandler({ ctx, input }: Options) {
  const m = await getMembership(ctx.user.id, input.teamId);
  if (!m) throw new TRPCError({ code: "NOT_FOUND" });

  if (input.accept) {
    if (m.accepted) return { ok: true as const };

    if (input.inviteToken) {
      const stored = await prisma.verificationToken.findUnique({
        where: { token: input.inviteToken },
        select: { identifier: true, expires: true, teamId: true },
      });
      const userEmail = ctx.user.email?.toLowerCase();
      const expired = stored?.expires ? stored.expires.getTime() < Date.now() : true;
      if (
        !stored ||
        expired ||
        stored.teamId !== input.teamId ||
        !userEmail ||
        stored.identifier.toLowerCase() !== userEmail
      ) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired invite token" });
      }
      // Consume the token atomically with the membership update so a retry
      // can't replay it.
      await prisma.$transaction([
        prisma.membership.update({
          where: { userId_teamId: { userId: ctx.user.id, teamId: input.teamId } },
          data: { accepted: true },
        }),
        prisma.verificationToken.delete({ where: { token: input.inviteToken } }),
      ]);
      return { ok: true as const };
    }

    await prisma.membership.update({
      where: { userId_teamId: { userId: ctx.user.id, teamId: input.teamId } },
      data: { accepted: true },
    });
    return { ok: true as const };
  }

  // Leaving: protect against losing the last owner.
  if (m.role === MembershipRole.OWNER) {
    const otherOwners = await prisma.membership.count({
      where: {
        teamId: input.teamId,
        role: MembershipRole.OWNER,
        NOT: { userId: ctx.user.id },
      },
    });
    if (otherOwners === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "You are the last owner — promote someone else first or delete the team",
      });
    }
  }

  await prisma.membership.delete({
    where: { userId_teamId: { userId: ctx.user.id, teamId: input.teamId } },
  });
  return { ok: true as const };
}
