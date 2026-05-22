// Clever fork (FORK-300-FORK): authorization helpers for webhook procedures
// extracted from util.ts to minimize divergence with upstream cal.com. See
// FORK-NOTES.md. Upstream's util.ts only checks `eventType.userId === ctx.user.id`,
// which breaks team admins managing team event-type webhooks. We need a richer
// check that allows accepted ADMIN/OWNER membership of the owning team.

import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

import { TRPCError } from "@trpc/server";

/**
 * Returns whether `userId` may manage the webhook tied to this event type.
 *
 * - User-owned event type: only the owner.
 * - Team event type (userId is null, teamId set): any accepted ADMIN or
 *   OWNER of the team.
 */
export async function canManageEventType(eventTypeId: number, userId: number): Promise<boolean> {
  const eventType = await prisma.eventType.findUnique({
    where: { id: eventTypeId },
    select: { id: true, userId: true, teamId: true },
  });
  if (!eventType) return false;

  if (eventType.userId && eventType.userId === userId) return true;

  if (eventType.teamId) {
    return isTeamAdminOrOwner({ userId, teamId: eventType.teamId });
  }

  return false;
}

/**
 * Returns whether `userId` is an accepted ADMIN or OWNER of `teamId`.
 */
export async function isTeamAdminOrOwner({
  userId,
  teamId,
}: {
  userId: number;
  teamId: number;
}): Promise<boolean> {
  const m = await prisma.membership.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: { role: true, accepted: true },
  });
  return !!m?.accepted && (m.role === MembershipRole.OWNER || m.role === MembershipRole.ADMIN);
}

/**
 * Asserts that `userId` may operate on `webhook`. Throws TRPCError otherwise.
 *
 * Resolution order:
 * - If the webhook is tied to an event type, defer to `canManageEventType`.
 * - Else if the webhook is tied to a team, require ADMIN/OWNER membership.
 * - Else if the webhook is user-owned, require strict identity.
 * - Else (no scope at all), deny by default.
 */
export async function assertCanAccessWebhook({
  webhook,
  userId,
}: {
  webhook: {
    userId: number | null;
    teamId: number | null;
    eventTypeId: number | null;
  };
  userId: number;
}): Promise<void> {
  if (webhook.eventTypeId) {
    if (!(await canManageEventType(webhook.eventTypeId, userId))) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return;
  }
  if (webhook.teamId) {
    if (!(await isTeamAdminOrOwner({ userId, teamId: webhook.teamId }))) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return;
  }
  if (webhook.userId) {
    if (webhook.userId !== userId) throw new TRPCError({ code: "FORBIDDEN" });
    return;
  }
  // Webhook with no scope. Unreachable under current FKs but deny by default.
  throw new TRPCError({ code: "FORBIDDEN" });
}
