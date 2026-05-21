import { prisma } from "@calcom/prisma";

import { TRPCError } from "@trpc/server";

import authedProcedure from "../../../procedures/authedProcedure";
// Clever fork (FORK-300-FORK): authorization logic lives in
// `authorization-clever.ts` to keep this file close to upstream. See
// FORK-NOTES.md.
import { assertCanAccessWebhook, canManageEventType } from "./authorization-clever";
import { webhookIdAndEventTypeIdSchema } from "./types";

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

      await assertCanAccessWebhook({ webhook, userId: ctx.user.id });
    } else if (eventTypeId) {
      // Operating in the scope of an event type (e.g. listing its webhooks).
      const ok = await canManageEventType(eventTypeId, ctx.user.id);
      if (!ok) throw new TRPCError({ code: "FORBIDDEN" });
    }

    return next();
  });
};

export const webhookProcedure = createWebhookProcedure();
