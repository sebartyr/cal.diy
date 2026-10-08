import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import type { TrpcSessionUser } from "../../../types";
import { ROLE_RANK, requireMember } from "./permissions";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { teamId: number };
};

export async function listMembersHandler({ ctx, input }: Options) {
  const callerMembership = await requireMember(ctx.user.id, input.teamId, undefined, ctx.user);

  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: { isPrivate: true },
  });

  // On a private team, plain members must not learn who has been invited nor
  // harvest contact details; only admins/owners need those to manage the team.
  const isRestricted =
    (team?.isPrivate ?? true) && ROLE_RANK[callerMembership.role] < ROLE_RANK[MembershipRole.ADMIN];

  const members = await prisma.membership.findMany({
    where: { teamId: input.teamId, ...(isRestricted ? { accepted: true } : {}) },
    select: {
      id: true,
      role: true,
      accepted: true,
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          avatarUrl: true,
          timeZone: true,
        },
      },
    },
    orderBy: [{ accepted: "desc" }, { user: { name: "asc" } }],
  });

  return members.map((member) => ({
    ...member,
    user: {
      ...member.user,
      email: isRestricted ? null : member.user.email,
      timeZone: isRestricted ? null : member.user.timeZone,
    },
  }));
}
