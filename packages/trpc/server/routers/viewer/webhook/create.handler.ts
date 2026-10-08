import { updateTriggerForExistingBookings } from "@calcom/features/webhooks/lib/scheduleTrigger";
import { validateUrlForSSRFSync } from "@calcom/lib/ssrfProtection";
import { prisma } from "@calcom/prisma";
import type { Prisma, Webhook } from "@calcom/prisma/client";
import { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { TRPCError } from "@trpc/server";
import { v4 } from "uuid";
import { isTeamAdminOrOwner } from "./authorization-clever";
import type { TCreateInputSchema } from "./create.schema";

type CreateOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TCreateInputSchema;
};

export const createHandler = async ({ ctx, input }: CreateOptions) => {
  const { user } = ctx;

  const validation = validateUrlForSSRFSync(input.subscriberUrl);
  if (!validation.isValid) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Webhook URL is not allowed: ${validation.error}`,
    });
  }

  if (input.platform && user.role !== "ADMIN") {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  // Clever fork: the webhook router middleware never looks at `teamId`, so
  // without this check any user could attach a webhook to another team and
  // receive all of its booking payloads.
  if (input.teamId && !(await isTeamAdminOrOwner({ userId: user.id, teamId: input.teamId }))) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  // Explicit allow-list so new schema fields cannot silently become writable.
  const webhookData: Prisma.WebhookUncheckedCreateInput = {
    id: v4(),
    subscriberUrl: input.subscriberUrl,
    eventTriggers: input.eventTriggers,
    active: input.active,
    payloadTemplate: input.payloadTemplate,
    appId: input.appId,
    secret: input.secret,
    time: input.time,
    timeUnit: input.timeUnit,
    version: input.version,
    platform: input.platform,
    eventTypeId: input.eventTypeId,
    teamId: input.teamId,
  };

  if (!input.platform && !input.eventTypeId && !input.teamId) {
    webhookData.userId = user.id;
  }

  if (input.eventTypeId) {
    const parentManagedEvt = await prisma.eventType.findFirst({
      where: {
        id: input.eventTypeId,
        parentId: {
          not: null,
        },
      },
      select: {
        parentId: true,
        metadata: true,
      },
    });

    if (parentManagedEvt?.parentId) {
      const isLocked = !EventTypeMetaDataSchema.parse(parentManagedEvt.metadata)?.managedEventConfig
        ?.unlockedFields?.webhooks;
      if (isLocked) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
    }
  }

  let newWebhook: Webhook;
  try {
    newWebhook = await prisma.webhook.create({
      data: webhookData,
    });
  } catch (error) {
    // Avoid printing raw prisma error on frontend
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create webhook" });
  }

  await updateTriggerForExistingBookings(newWebhook, [], newWebhook.eventTriggers);

  return newWebhook;
};
