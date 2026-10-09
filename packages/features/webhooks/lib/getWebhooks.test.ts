import type { PrismaClient } from "@calcom/prisma";
import { WebhookTriggerEvents } from "@calcom/prisma/enums";
import { describe, expect, it, vi } from "vitest";
import getWebhooks, { getWebhooksForTriggers } from "./getWebhooks";

type WebhookRow = {
  id: string;
  subscriberUrl: string;
  payloadTemplate: string | null;
  appId: string | null;
  secret: string | null;
  time: number | null;
  timeUnit: "MINUTE" | "HOUR" | "DAY" | null;
  eventTriggers: WebhookTriggerEvents[];
  version: string;
  active: boolean;
  platform: boolean;
  userId: number | null;
  eventTypeId: number | null;
  teamId: number | null;
  platformOAuthClientId: string | null;
};

type OrCondition = {
  platform?: boolean;
  userId?: number;
  eventTypeId?: number;
  teamId?: { in: number[] };
  platformOAuthClientId?: string;
};

type WebhookWhere = {
  OR: OrCondition[];
  AND: {
    eventTriggers: { has?: WebhookTriggerEvents; hasSome?: WebhookTriggerEvents[] };
    active: { equals: boolean };
  };
};

const matchesOr = (row: WebhookRow, condition: OrCondition) => {
  if (condition.platform !== undefined) return row.platform === condition.platform;
  if (condition.userId !== undefined) return row.userId === condition.userId;
  if (condition.eventTypeId !== undefined) return row.eventTypeId === condition.eventTypeId;
  if (condition.teamId !== undefined) return row.teamId !== null && condition.teamId.in.includes(row.teamId);
  if (condition.platformOAuthClientId !== undefined)
    return row.platformOAuthClientId === condition.platformOAuthClientId;
  return false;
};

const matchesTriggers = (row: WebhookRow, filter: WebhookWhere["AND"]["eventTriggers"]) => {
  if (filter.has !== undefined) return row.eventTriggers.includes(filter.has);
  if (filter.hasSome !== undefined) return filter.hasSome.some((t) => row.eventTriggers.includes(t));
  return false;
};

const toSelected = (row: WebhookRow) => ({
  id: row.id,
  subscriberUrl: row.subscriberUrl,
  payloadTemplate: row.payloadTemplate,
  appId: row.appId,
  secret: row.secret,
  time: row.time,
  timeUnit: row.timeUnit,
  eventTriggers: row.eventTriggers,
  version: row.version,
});

const createPrisma = (rows: WebhookRow[], eventTypes: { id: number; parentId: number | null }[]) => {
  const webhookFindMany = vi.fn(async ({ where }: { where: WebhookWhere }) =>
    rows
      .filter(
        (row) =>
          where.OR.some((condition) => matchesOr(row, condition)) &&
          matchesTriggers(row, where.AND.eventTriggers) &&
          row.active === where.AND.active.equals
      )
      .map(toSelected)
  );
  const eventTypeFindFirst = vi.fn(async ({ where }: { where: { id: number } }) => {
    const eventType = eventTypes.find((et) => et.id === where.id && et.parentId !== null);
    return eventType ? { parentId: eventType.parentId } : null;
  });
  const prisma = {
    webhook: { findMany: webhookFindMany },
    eventType: { findFirst: eventTypeFindFirst },
  } as unknown as PrismaClient;
  return { prisma, webhookFindMany, eventTypeFindFirst };
};

const baseRow = (overrides: Partial<WebhookRow> & Pick<WebhookRow, "id" | "eventTriggers">): WebhookRow => ({
  subscriberUrl: `https://example.com/${overrides.id}`,
  payloadTemplate: null,
  appId: null,
  secret: null,
  time: null,
  timeUnit: null,
  version: "2021-10-20",
  active: true,
  platform: false,
  userId: null,
  eventTypeId: null,
  teamId: null,
  platformOAuthClientId: null,
  ...overrides,
});

const { MEETING_ENDED, MEETING_STARTED, BOOKING_CREATED, AFTER_HOSTS_CAL_VIDEO_NO_SHOW } =
  WebhookTriggerEvents;

const rows: WebhookRow[] = [
  baseRow({ id: "user-multi", userId: 1, eventTriggers: [BOOKING_CREATED, MEETING_ENDED, MEETING_STARTED] }),
  baseRow({ id: "user-inactive", userId: 1, active: false, eventTriggers: [BOOKING_CREATED] }),
  baseRow({ id: "event-type", eventTypeId: 10, eventTriggers: [MEETING_ENDED] }),
  baseRow({ id: "managed-parent", eventTypeId: 5, eventTriggers: [MEETING_STARTED, BOOKING_CREATED] }),
  baseRow({ id: "platform", platform: true, eventTriggers: [BOOKING_CREATED] }),
  baseRow({ id: "oauth-client", platformOAuthClientId: "client", eventTriggers: [MEETING_ENDED] }),
  baseRow({ id: "team", teamId: 7, eventTriggers: [BOOKING_CREATED] }),
  baseRow({ id: "org", teamId: 99, eventTriggers: [MEETING_STARTED] }),
  baseRow({ id: "other-user", userId: 2, eventTriggers: [BOOKING_CREATED, MEETING_ENDED] }),
  baseRow({
    id: "no-show",
    userId: 1,
    time: 5,
    timeUnit: "MINUTE",
    eventTriggers: [AFTER_HOSTS_CAL_VIDEO_NO_SHOW],
  }),
];
const eventTypes = [
  { id: 10, parentId: 5 },
  { id: 5, parentId: null },
];

const sortById = <T extends { id: string }>(list: T[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));

describe("getWebhooksForTriggers", () => {
  const optionsVariants = [
    { userId: 1, eventTypeId: 10, teamId: null, orgId: null, oAuthClientId: "client" },
    { userId: 1, eventTypeId: 10, teamId: [7], orgId: 99, oAuthClientId: null },
    { userId: null, eventTypeId: 5, teamId: 7, orgId: null },
    { userId: 2, eventTypeId: null },
  ];
  const triggers = [MEETING_ENDED, MEETING_STARTED, BOOKING_CREATED, AFTER_HOSTS_CAL_VIDEO_NO_SHOW];

  it.each(optionsVariants)("returns per trigger exactly what getWebhooks returns (%o)", async (options) => {
    const { prisma } = createPrisma(rows, eventTypes);

    const grouped = await getWebhooksForTriggers(options, triggers, prisma);

    for (const trigger of triggers) {
      const expected = await getWebhooks({ ...options, triggerEvent: trigger }, prisma);
      expect(sortById(grouped[trigger])).toEqual(sortById(expected));
    }
  });

  it("resolves all triggers with a single webhook query and a single parent lookup", async () => {
    const { prisma, webhookFindMany, eventTypeFindFirst } = createPrisma(rows, eventTypes);

    await getWebhooksForTriggers({ userId: 1, eventTypeId: 10 }, triggers, prisma);

    expect(webhookFindMany).toHaveBeenCalledTimes(1);
    expect(eventTypeFindFirst).toHaveBeenCalledTimes(1);
    expect(webhookFindMany.mock.calls[0][0].where.AND.eventTriggers).toEqual({ hasSome: triggers });
  });

  it("uses the same subscriber filter as getWebhooks apart from the trigger condition", async () => {
    const { prisma, webhookFindMany } = createPrisma(rows, eventTypes);
    const options = { userId: 1, eventTypeId: 10, teamId: [7], orgId: 99, oAuthClientId: "client" };

    await getWebhooks({ ...options, triggerEvent: MEETING_ENDED }, prisma);
    await getWebhooksForTriggers(options, [MEETING_ENDED], prisma);

    const [single, batched] = webhookFindMany.mock.calls.map(([args]) => args);
    expect(batched.where.OR).toEqual(single.where.OR);
    expect(batched.where.AND.active).toEqual(single.where.AND.active);
    expect(single.where.AND.eventTriggers).toEqual({ has: MEETING_ENDED });
  });

  it("lists a subscriber under each requested trigger it listens to, once per trigger", async () => {
    const { prisma } = createPrisma(rows, eventTypes);

    const grouped = await getWebhooksForTriggers(
      { userId: 1, eventTypeId: null },
      [MEETING_ENDED, MEETING_STARTED, MEETING_ENDED],
      prisma
    );

    expect(Object.keys(grouped).sort()).toEqual([MEETING_ENDED, MEETING_STARTED].sort());
    expect(grouped[MEETING_ENDED].map((s) => s.id)).toEqual(["user-multi"]);
    expect(grouped[MEETING_STARTED].map((s) => s.id)).toEqual(["user-multi"]);
  });

  it("excludes inactive webhooks and keeps empty lists for triggers without subscribers", async () => {
    const { prisma } = createPrisma(rows, eventTypes);

    const grouped = await getWebhooksForTriggers(
      { userId: 1, eventTypeId: null },
      [BOOKING_CREATED, WebhookTriggerEvents.BOOKING_CANCELLED],
      prisma
    );

    expect(grouped[BOOKING_CREATED].map((s) => s.id).sort()).toEqual(["platform", "user-multi"]);
    expect(grouped[WebhookTriggerEvents.BOOKING_CANCELLED]).toEqual([]);
  });

  it("does not query when no trigger is requested", async () => {
    const { prisma, webhookFindMany, eventTypeFindFirst } = createPrisma(rows, eventTypes);

    const grouped = await getWebhooksForTriggers({ userId: 1 }, [], prisma);

    expect(grouped).toEqual({});
    expect(webhookFindMany).not.toHaveBeenCalled();
    expect(eventTypeFindFirst).not.toHaveBeenCalled();
  });
});
