import { prisma } from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/enums";

import { requireMember } from "./permissions";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { teamId: number };
};

/**
 * Per-member breakdown of upcoming accepted bookings on the team's event types.
 * Used for the "active per member" chart on the team dashboard.
 */
export async function getActiveUserBreakdownHandler({ ctx, input }: Options) {
  await requireMember(ctx.user.id, input.teamId, undefined, ctx.user);

  const members = await prisma.membership.findMany({
    where: { teamId: input.teamId, accepted: true },
    select: {
      user: { select: { id: true, name: true, username: true, avatarUrl: true } },
    },
  });

  // Single aggregate query instead of one COUNT per member.
  const grouped = await prisma.booking.groupBy({
    by: ["userId"],
    where: {
      userId: { in: members.map((m) => m.user.id) },
      eventType: { teamId: input.teamId },
      startTime: { gte: new Date() },
      status: BookingStatus.ACCEPTED,
    },
    _count: { _all: true },
  });

  const countsByUserId = new Map<number, number>();
  for (const row of grouped) {
    if (row.userId !== null) countsByUserId.set(row.userId, row._count._all);
  }

  return members
    .map(({ user }) => ({ user, bookings: countsByUserId.get(user.id) ?? 0 }))
    .sort((a, b) => b.bookings - a.bookings);
}
