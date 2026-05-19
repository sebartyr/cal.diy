import { TRPCError } from "@trpc/server";

import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

import { requireMember, getMembership } from "./permissions";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { teamId: number; memberId: number };
};

export async function removeMemberHandler({ ctx, input }: Options) {
  await requireMember(ctx.user.id, input.teamId, MembershipRole.ADMIN);

  const target = await getMembership(input.memberId, input.teamId);
  if (!target) throw new TRPCError({ code: "NOT_FOUND" });

  // Owners are protected — only another owner can demote/remove them.
  if (target.role === MembershipRole.OWNER) {
    const caller = await getMembership(ctx.user.id, input.teamId);
    if (caller?.role !== MembershipRole.OWNER) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only an owner can remove another owner" });
    }
    // Don't allow removing the last owner.
    const otherOwners = await prisma.membership.count({
      where: { teamId: input.teamId, role: MembershipRole.OWNER, NOT: { userId: input.memberId } },
    });
    if (otherOwners === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot remove the last owner" });
    }
  }

  await prisma.membership.delete({
    where: { userId_teamId: { userId: input.memberId, teamId: input.teamId } },
  });

  // Detach this user from all team event types' hosts.
  await prisma.host.deleteMany({
    where: { userId: input.memberId, eventType: { teamId: input.teamId } },
  });

  return { ok: true as const };
}
