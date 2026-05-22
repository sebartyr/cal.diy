import { TRPCError } from "@trpc/server";

import { prisma } from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/enums";

import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { teamId: number; force?: boolean };
};

/**
 * System-admin team deletion — bypasses the OWNER-membership requirement of
 * the regular `delete` mutation. Gated via `authedAdminProcedure` in the router.
 *
 * SEC-306-FORK (Sprint 4): refuse to delete a team that still has future
 * accepted/pending bookings unless the caller passes `force: true`. Avoids
 * accidental tenant destruction.
 */
export async function adminDeleteHandler({ input }: Options) {
  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: { id: true, isOrganization: true },
  });
  if (!team) throw new TRPCError({ code: "NOT_FOUND" });
  if (team.isOrganization) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Refusing to delete an organization here" });
  }

  if (!input.force) {
    const activeBookings = await prisma.booking.count({
      where: {
        eventType: { teamId: input.teamId },
        endTime: { gt: new Date() },
        status: { in: [BookingStatus.ACCEPTED, BookingStatus.PENDING] },
      },
    });
    if (activeBookings > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Team has ${activeBookings} active future booking(s). Re-issue with force: true to confirm.`,
      });
    }
  }

  await prisma.team.delete({ where: { id: input.teamId } });
  return { ok: true as const };
}
