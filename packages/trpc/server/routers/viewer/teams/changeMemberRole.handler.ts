import { TRPCError } from "@trpc/server";

import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

import { requireMember, getMembership } from "./permissions";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { teamId: number; memberId: number; role: MembershipRole };
};

export async function changeMemberRoleHandler({ ctx, input }: Options) {
  await requireMember(ctx.user.id, input.teamId, MembershipRole.OWNER);

  const target = await getMembership(input.memberId, input.teamId);
  if (!target) throw new TRPCError({ code: "NOT_FOUND" });

  // Demoting an OWNER is fine, but never end up with zero owners.
  if (target.role === MembershipRole.OWNER && input.role !== MembershipRole.OWNER) {
    const otherOwners = await prisma.membership.count({
      where: { teamId: input.teamId, role: MembershipRole.OWNER, NOT: { userId: input.memberId } },
    });
    if (otherOwners === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot demote the last owner" });
    }
  }

  return prisma.membership.update({
    where: { userId_teamId: { userId: input.memberId, teamId: input.teamId } },
    data: { role: input.role },
    select: { id: true, role: true },
  });
}
