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
  await requireMember(ctx.user.id, input.teamId);

  const members = await prisma.membership.findMany({
    where: { teamId: input.teamId, accepted: true },
    select: {
      user: { select: { id: true, name: true, username: true, avatarUrl: true } },
    },
  });

  const counts = await Promise.all(
    members.map(async ({ user }) => {
      const bookings = await prisma.booking.count({
        where: {
          userId: user.id,
          eventType: { teamId: input.teamId },
          startTime: { gte: new Date() },
          status: BookingStatus.ACCEPTED,
        },
      });
      return { user, bookings };
    })
  );

  counts.sort((a, b) => b.bookings - a.bookings);
  return counts;
}
