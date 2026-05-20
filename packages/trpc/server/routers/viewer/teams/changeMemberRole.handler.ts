import { TRPCError } from "@trpc/server";

import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

import { requireMember, getMembership } from "./permissions";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { teamId: number; userId: number; role: MembershipRole };
};

export async function changeMemberRoleHandler({ ctx, input }: Options) {
  await requireMember(ctx.user.id, input.teamId, MembershipRole.OWNER, ctx.user);

  const target = await getMembership(input.userId, input.teamId);
  if (!target) throw new TRPCError({ code: "NOT_FOUND" });

  if (target.role === MembershipRole.OWNER && input.role !== MembershipRole.OWNER) {
    const otherOwners = await prisma.membership.count({
      where: { teamId: input.teamId, role: MembershipRole.OWNER, NOT: { userId: input.userId } },
    });
    if (otherOwners === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot demote the last owner" });
    }
  }

  return prisma.membership.update({
    where: { userId_teamId: { userId: input.userId, teamId: input.teamId } },
    data: { role: input.role },
    select: { id: true, role: true },
  });
}
