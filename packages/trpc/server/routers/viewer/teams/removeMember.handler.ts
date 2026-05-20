import { TRPCError } from "@trpc/server";

import { prisma } from "@calcom/prisma";
import { MembershipRole, UserPermissionRole } from "@calcom/prisma/enums";

import { requireMember, getMembership } from "./permissions";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { teamId: number; userId: number };
};

export async function removeMemberHandler({ ctx, input }: Options) {
  await requireMember(ctx.user.id, input.teamId, MembershipRole.ADMIN, ctx.user);

  const target = await getMembership(input.userId, input.teamId);
  if (!target) throw new TRPCError({ code: "NOT_FOUND" });

  // ADMIN+ is required to remove a MEMBER. Removing another ADMIN or an
  // OWNER requires OWNER — keeps a co-admin from kicking another admin out
  // unilaterally (matches the original cal.com semantics).
  const isSystemAdmin = ctx.user.role === UserPermissionRole.ADMIN;
  if (target.role === MembershipRole.OWNER || target.role === MembershipRole.ADMIN) {
    const caller = await getMembership(ctx.user.id, input.teamId);
    if (!isSystemAdmin && caller?.role !== MembershipRole.OWNER) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only an owner can remove an admin or owner" });
    }
    if (target.role === MembershipRole.OWNER) {
      const otherOwners = await prisma.membership.count({
        where: { teamId: input.teamId, role: MembershipRole.OWNER, NOT: { userId: input.userId } },
      });
      if (otherOwners === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot remove the last owner" });
      }
    }
  }

  // Drop the membership and detach from any team event types in one go so
  // we never leave the user as a host on a team they're no longer in.
  await prisma.$transaction([
    prisma.membership.delete({
      where: { userId_teamId: { userId: input.userId, teamId: input.teamId } },
    }),
    prisma.host.deleteMany({
      where: { userId: input.userId, eventType: { teamId: input.teamId } },
    }),
  ]);

  return { ok: true as const };
}
