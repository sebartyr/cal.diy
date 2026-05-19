import { prisma } from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/enums";

import { requireMember } from "./permissions";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { teamId: number };
};

/**
 * Total upcoming + accepted bookings count for this team's event types.
 * Used as a top-level analytics number on the team dashboard.
 */
export async function getActiveUserBookingsHandler({ ctx, input }: Options) {
  await requireMember(ctx.user.id, input.teamId);

  const count = await prisma.booking.count({
    where: {
      eventType: { teamId: input.teamId },
      startTime: { gte: new Date() },
      status: BookingStatus.ACCEPTED,
    },
  });

  return { teamId: input.teamId, activeBookings: count };
}
