import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

import { TRPCError } from "@trpc/server";

import authedProcedure from "../../../procedures/authedProcedure";
import { webhookIdAndEventTypeIdSchema } from "./types";

/**
 * Returns whether `userId` may manage the webhook tied to this event type.
 *
 * - User-owned event type: only the owner.
 * - Team event type (userId is null, teamId set): any accepted ADMIN or
 *   OWNER of the team.
 */
async function canManageEventType(eventTypeId: number, userId: number): Promise<boolean> {
  const eventType = await prisma.eventType.findUnique({
    where: { id: eventTypeId },
    select: { id: true, userId: true, teamId: true },
  });
  if (!eventType) return false;

  if (eventType.userId && eventType.userId === userId) return true;

  if (eventType.teamId) {
    const m = await prisma.membership.findUnique({
      where: { userId_teamId: { userId, teamId: eventType.teamId } },
      select: { role: true, accepted: true },
    });
    return !!m?.accepted && (m.role === MembershipRole.OWNER || m.role === MembershipRole.ADMIN);
  }

  return false;
}

export const createWebhookProcedure = () => {
  return authedProcedure.input(webhookIdAndEventTypeIdSchema.optional()).use(async ({ ctx, input, next }) => {
    if (!input) return next();

    const { id, webhookId, eventTypeId } = input;
    const lookupId = id || webhookId;

    if (lookupId) {
      // Editing/reading an existing webhook — resolve scope via its FK.
      const webhook = await prisma.webhook.findUnique({
        where: { id: lookupId },
        select: { id: true, userId: true, teamId: true, eventTypeId: true },
      });

      if (!webhook) throw new TRPCError({ code: "NOT_FOUND" });

      if (eventTypeId && eventTypeId !== webhook.eventTypeId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      if (webhook.eventTypeId) {
        const ok = await canManageEventType(webhook.eventTypeId, ctx.user.id);
        if (!ok) throw new TRPCError({ code: "FORBIDDEN" });
      } else if (webhook.teamId) {
        const m = await prisma.membership.findUnique({
          where: { userId_teamId: { userId: ctx.user.id, teamId: webhook.teamId } },
          select: { role: true, accepted: true },
        });
        const allowed =
          !!m?.accepted && (m.role === MembershipRole.OWNER || m.role === MembershipRole.ADMIN);
        if (!allowed) throw new TRPCError({ code: "FORBIDDEN" });
      } else if (webhook.userId && webhook.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
    } else if (eventTypeId) {
      // Operating in the scope of an event type (e.g. listing its webhooks).
      const ok = await canManageEventType(eventTypeId, ctx.user.id);
      if (!ok) throw new TRPCError({ code: "FORBIDDEN" });
    }

    return next();
  });
};

export const webhookProcedure = createWebhookProcedure();
