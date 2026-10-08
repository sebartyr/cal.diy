import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const webhookCreate = vi.fn();
const webhookUpdate = vi.fn();
const webhookFindUnique = vi.fn();
const eventTypeFindFirst = vi.fn();
const isTeamAdminOrOwner = vi.fn();

vi.mock("@calcom/prisma", () => ({
  prisma: {
    webhook: {
      create: (args: unknown) => webhookCreate(args),
      update: (args: unknown) => webhookUpdate(args),
      findUnique: (args: unknown) => webhookFindUnique(args),
    },
    eventType: { findFirst: (args: unknown) => eventTypeFindFirst(args) },
  },
}));

vi.mock("@calcom/features/webhooks/lib/scheduleTrigger", () => ({
  updateTriggerForExistingBookings: vi.fn(),
  deleteWebhookScheduledTriggers: vi.fn(),
  cancelNoShowTasksForBooking: vi.fn(),
}));

vi.mock("@calcom/lib/ssrfProtection", () => ({
  validateUrlForSSRFSync: () => ({ isValid: true }),
}));

vi.mock("../authorization-clever", () => ({
  isTeamAdminOrOwner: (args: unknown) => isTeamAdminOrOwner(args),
}));

import { createHandler } from "../create.handler";
import { editHandler } from "../edit.handler";

const user = { id: 7, role: "USER" } as NonNullable<TrpcSessionUser>;

const baseCreateInput = {
  subscriberUrl: "https://example.com/hook",
  eventTriggers: ["BOOKING_CREATED" as const],
  active: true,
  payloadTemplate: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  webhookCreate.mockImplementation(async ({ data }) => ({ ...data, eventTriggers: data.eventTriggers }));
  webhookUpdate.mockImplementation(async ({ data }) => ({ id: "wh-1", ...data }));
});

describe("createHandler team scope", () => {
  it("rejects a teamId the user does not administer", async () => {
    isTeamAdminOrOwner.mockResolvedValueOnce(false);

    await expect(
      createHandler({ ctx: { user }, input: { ...baseCreateInput, teamId: 42 } })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(isTeamAdminOrOwner).toHaveBeenCalledWith({ userId: 7, teamId: 42 });
    expect(webhookCreate).not.toHaveBeenCalled();
  });

  it("creates a team webhook for a team admin without attaching the user", async () => {
    isTeamAdminOrOwner.mockResolvedValueOnce(true);

    await createHandler({ ctx: { user }, input: { ...baseCreateInput, teamId: 42 } });

    const { data } = webhookCreate.mock.calls[0][0];
    expect(data.teamId).toBe(42);
    expect(data.userId).toBeUndefined();
  });

  it("attaches personal webhooks to the current user", async () => {
    await createHandler({ ctx: { user }, input: baseCreateInput });

    expect(isTeamAdminOrOwner).not.toHaveBeenCalled();
    const { data } = webhookCreate.mock.calls[0][0];
    expect(data.userId).toBe(7);
    expect(data.teamId).toBeUndefined();
  });

  it("ignores fields outside the allow-list", async () => {
    const input = { ...baseCreateInput, userId: 999, platformOAuthClientId: "client" };

    await createHandler({ ctx: { user }, input });

    const { data } = webhookCreate.mock.calls[0][0];
    expect(data.userId).toBe(7);
    expect(data).not.toHaveProperty("platformOAuthClientId");
  });
});

describe("editHandler scope fields", () => {
  it("never writes teamId or eventTypeId from the input", async () => {
    webhookFindUnique.mockResolvedValueOnce({
      id: "wh-1",
      subscriberUrl: "https://example.com/hook",
      platform: false,
      active: false,
      eventTriggers: [],
      userId: 7,
      teamId: null,
      eventTypeId: null,
    });

    await editHandler({
      ctx: { user },
      input: {
        id: "wh-1",
        teamId: 42,
        eventTypeId: 5,
        payloadTemplate: null,
        active: false,
        subscriberUrl: "https://example.com/new",
      },
    });

    const { data } = webhookUpdate.mock.calls[0][0];
    expect(data).not.toHaveProperty("teamId");
    expect(data).not.toHaveProperty("eventTypeId");
    expect(data).not.toHaveProperty("userId");
    expect(data.subscriberUrl).toBe("https://example.com/new");
  });
});
