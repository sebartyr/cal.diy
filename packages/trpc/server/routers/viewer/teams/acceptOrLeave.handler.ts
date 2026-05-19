import { TRPCError } from "@trpc/server";

import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

import { getMembership } from "./permissions";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { teamId: number; accept: boolean };
};

export async function acceptOrLeaveHandler({ ctx, input }: Options) {
  const m = await getMembership(ctx.user.id, input.teamId);
  if (!m) throw new TRPCError({ code: "NOT_FOUND" });

  if (input.accept) {
    if (m.accepted) return { ok: true as const };
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
