import { TRPCError } from "@trpc/server";

import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

import { requireMember } from "./permissions";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { teamId: number; eventTypeIds: number[]; userIds: number[] };
};

/**
 * Adds users as hosts on multiple team event types in one shot.
 * Idempotent — already-host pairings are skipped.
 */
export async function addMembersToEventTypesHandler({ ctx, input }: Options) {
  await requireMember(ctx.user.id, input.teamId, MembershipRole.ADMIN, ctx.user);

  const eventTypes = await prisma.eventType.findMany({
    where: { id: { in: input.eventTypeIds }, teamId: input.teamId },
    select: { id: true },
  });
  if (eventTypes.length !== input.eventTypeIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Some event types do not belong to this team" });
  }

  const memberships = await prisma.membership.findMany({
    where: { teamId: input.teamId, userId: { in: input.userIds }, accepted: true },
    select: { userId: true },
  });
  if (memberships.length !== input.userIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Some users are not members of this team" });
  }

  const pairings = input.eventTypeIds.flatMap((eventTypeId) =>
    input.userIds.map((userId) => ({ eventTypeId, userId, isFixed: false }))
  );

  const result = await prisma.host.createMany({ data: pairings, skipDuplicates: true });

  return {
    eventTypeCount: input.eventTypeIds.length,
    userCount: input.userIds.length,
    hostPairs: result.count,
  };
}
