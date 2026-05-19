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
  await requireMember(ctx.user.id, input.teamId, MembershipRole.ADMIN);

  // Validate that all event types belong to this team.
  const eventTypes = await prisma.eventType.findMany({
    where: { id: { in: input.eventTypeIds }, teamId: input.teamId },
    select: { id: true },
  });
  if (eventTypes.length !== input.eventTypeIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Some event types do not belong to this team" });
  }

  // Validate that all users are accepted members of the team.
  const memberships = await prisma.membership.findMany({
    where: { teamId: input.teamId, userId: { in: input.userIds }, accepted: true },
    select: { userId: true },
  });
  if (memberships.length !== input.userIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Some users are not members of this team" });
  }

  let added = 0;
  for (const eventTypeId of input.eventTypeIds) {
    for (const userId of input.userIds) {
      const result = await prisma.host.upsert({
        where: { userId_eventTypeId: { userId, eventTypeId } },
        create: { userId, eventTypeId, isFixed: false },
        update: {},
        select: { userId: true },
      });
      if (result) added++;
    }
  }

  return { eventTypeCount: input.eventTypeIds.length, userCount: input.userIds.length, hostPairs: added };
}
