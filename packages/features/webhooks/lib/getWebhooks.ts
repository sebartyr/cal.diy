import { withReporting } from "@calcom/lib/sentryWrapper";
import type { PrismaClient } from "@calcom/prisma";
import defaultPrisma from "@calcom/prisma";
import type { WebhookTriggerEvents } from "@calcom/prisma/enums";
import type { WebhookSubscriber } from "./dto/types";
import { WebhookOutputMapper } from "./infrastructure/mappers/WebhookOutputMapper";

export type GetSubscriberOptions = {
  userId?: number | null;
  eventTypeId?: number | null;
  triggerEvent: WebhookTriggerEvents;
  teamId?: number | number[] | null;
  orgId?: number | null;
  oAuthClientId?: string | null;
};

export type GetSubscribersForTriggersOptions = Omit<GetSubscriberOptions, "triggerEvent">;

const findActiveSubscribers = async (
  options: GetSubscribersForTriggersOptions,
  eventTriggersFilter: { has: WebhookTriggerEvents } | { hasSome: WebhookTriggerEvents[] },
  prisma: PrismaClient
): Promise<WebhookSubscriber[]> => {
  const teamId = options.teamId;
  const userId = options.userId ?? 0;
  const eventTypeId = options.eventTypeId ?? 0;
  const teamIds = Array.isArray(teamId) ? teamId : [teamId ?? 0];
  const orgId = options.orgId ?? 0;
  const oAuthClientId = options.oAuthClientId ?? "";

  const managedChildEventType = await prisma.eventType.findFirst({
    where: {
      id: eventTypeId,
      parentId: {
        not: null,
      },
    },
    select: {
      parentId: true,
    },
  });

  const managedParentEventTypeId = managedChildEventType?.parentId ?? 0;

  // if we have userId and teamId it is a managed event type and should trigger for team and user
  const allWebhooks = await prisma.webhook.findMany({
    where: {
      OR: [
        {
          platform: true,
        },
        {
          userId,
        },
        {
          eventTypeId,
        },
        {
          eventTypeId: managedParentEventTypeId,
        },
        {
          teamId: {
            in: [...teamIds, orgId],
          },
        },
        { platformOAuthClientId: oAuthClientId },
      ],
      AND: {
        eventTriggers: eventTriggersFilter,
        active: {
          equals: true,
        },
      },
    },
    select: {
      id: true,
      subscriberUrl: true,
      payloadTemplate: true,
      appId: true,
      secret: true,
      time: true,
      timeUnit: true,
      eventTriggers: true,
      version: true,
    },
  });

  return allWebhooks.map(WebhookOutputMapper.toSubscriberPartial);
};

const getWebhooks = async (
  options: GetSubscriberOptions,
  prisma: PrismaClient = defaultPrisma
): Promise<WebhookSubscriber[]> => {
  const { triggerEvent, ...subscriberOptions } = options;
  return findActiveSubscribers(subscriberOptions, { has: triggerEvent }, prisma);
};

/**
 * Same subscribers as calling getWebhooks once per trigger with identical options,
 * but resolved with a single round trip so booking flows don't pay one query pair per trigger.
 */
const getWebhooksForTriggers = async <T extends WebhookTriggerEvents>(
  options: GetSubscribersForTriggersOptions,
  triggers: readonly T[],
  prisma: PrismaClient = defaultPrisma
): Promise<Record<T, WebhookSubscriber[]>> => {
  const uniqueTriggers = Array.from(new Set(triggers));
  const subscribersByTrigger = {} as Record<T, WebhookSubscriber[]>;
  for (const trigger of uniqueTriggers) {
    subscribersByTrigger[trigger] = [];
  }
  if (uniqueTriggers.length === 0) return subscribersByTrigger;

  const subscribers = await findActiveSubscribers(options, { hasSome: uniqueTriggers }, prisma);

  for (const subscriber of subscribers) {
    for (const trigger of uniqueTriggers) {
      if (subscriber.eventTriggers.includes(trigger)) {
        subscribersByTrigger[trigger].push(subscriber);
      }
    }
  }

  return subscribersByTrigger;
};

const getWebhooksForTriggersWithReporting = withReporting(getWebhooksForTriggers, "getWebhooksForTriggers");

export { getWebhooksForTriggersWithReporting as getWebhooksForTriggers };

export default withReporting(getWebhooks, "getWebhooks");
