import {
  cancelNoShowTasksForBooking,
  deleteWebhookScheduledTriggers,
  updateTriggerForExistingBookings,
} from "@calcom/features/webhooks/lib/scheduleTrigger";
import { validateUrlForSSRFSync } from "@calcom/lib/ssrfProtection";
import { prisma } from "@calcom/prisma";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { TRPCError } from "@trpc/server";
import type { TEditInputSchema } from "./edit.schema";

type EditOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TEditInputSchema;
};

export const editHandler = async ({ input, ctx }: EditOptions) => {
  // Scope fields (teamId, eventTypeId, userId, platform) are deliberately not
  // writable here: the router middleware authorizes against the webhook's
  // current scope, so letting edit change it would bypass that check.
  const {
    id,
    subscriberUrl,
    eventTriggers,
    active,
    payloadTemplate,
    appId,
    secret,
    time,
    timeUnit,
    version,
  } = input;

  const webhook = await prisma.webhook.findUnique({
    where: {
      id,
    },
  });

  if (!webhook) {
    return null;
  }

  // SSRF validation: only validate if URL is being changed
  if (subscriberUrl && subscriberUrl !== webhook.subscriberUrl) {
    const validation = validateUrlForSSRFSync(subscriberUrl);
    if (!validation.isValid) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Webhook URL is not allowed: ${validation.error}`,
      });
    }
  }

  if (webhook.platform) {
    const { user } = ctx;
    if (user?.role !== "ADMIN") {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
  }

  const updatedWebhook = await prisma.webhook.update({
    where: {
      id,
    },
    data: {
      subscriberUrl,
      eventTriggers,
      active,
      payloadTemplate,
      appId,
      secret,
      time: time ?? null,
      timeUnit: timeUnit ?? null,
      version,
    },
  });

  if (active) {
    const activeTriggersBefore = webhook.active ? webhook.eventTriggers : [];
    await updateTriggerForExistingBookings(webhook, activeTriggersBefore, updatedWebhook.eventTriggers);
  } else if (!active && webhook.active) {
    await cancelNoShowTasksForBooking({
      webhook: {
        id: webhook.id,
        userId: webhook.userId,
        teamId: webhook.teamId,
        eventTypeId: webhook.eventTypeId,
      },
    });
    await deleteWebhookScheduledTriggers({ webhookId: webhook.id });
  }

  return updatedWebhook;
};
