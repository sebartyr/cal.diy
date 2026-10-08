import type { IEventTypesRepository } from "@calcom/features/eventtypes/eventtypes.repository.interface";
import type { IUsersRepository } from "@calcom/features/users/users.repository.interface";
import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebhookRepository } from "./WebhookRepository";

const membershipFindMany = vi.fn();
const webhookFindMany = vi.fn();
const userFindUnique = vi.fn();

const prismaMock = {
  membership: { findMany: membershipFindMany },
  webhook: { findMany: webhookFindMany },
  user: { findUnique: userFindUnique },
} as unknown as PrismaClient;

const repository = new WebhookRepository(prismaMock, {} as IEventTypesRepository, {} as IUsersRepository);

const makeWebhook = (overrides: Record<string, unknown> = {}) => ({
  id: "wh-1",
  subscriberUrl: "https://example.com/hook",
  payloadTemplate: null,
  appId: null,
  secret: "s3cr3t",
  active: true,
  eventTriggers: [],
  eventTypeId: null,
  teamId: 42,
  userId: null,
  time: null,
  timeUnit: null,
  version: "2021-10-20",
  createdAt: new Date(0),
  platform: false,
  platformOAuthClientId: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WebhookRepository.listWebhooks team scope", () => {
  it("only includes teams where the user is an accepted ADMIN or OWNER", async () => {
    membershipFindMany.mockResolvedValueOnce([{ teamId: 42 }]);
    webhookFindMany.mockResolvedValueOnce([]);

    await repository.listWebhooks({ userId: 7 });

    expect(membershipFindMany).toHaveBeenCalledWith({
      where: {
        userId: 7,
        accepted: true,
        role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
      },
      select: { teamId: true },
    });
    const { where } = webhookFindMany.mock.calls[0][0];
    expect(where.AND).toContainEqual({ OR: [{ userId: 7 }, { teamId: { in: [42] } }] });
  });

  it("restricts to personal webhooks when the user manages no team", async () => {
    membershipFindMany.mockResolvedValueOnce([]);
    webhookFindMany.mockResolvedValueOnce([]);

    await repository.listWebhooks({ userId: 7 });

    const { where } = webhookFindMany.mock.calls[0][0];
    expect(where.AND).toContainEqual({ OR: [{ userId: 7 }] });
  });
});

describe("WebhookRepository.getFilteredWebhooksForUser team permissions", () => {
  const mockUserWithRole = (role: MembershipRole) =>
    userFindUnique.mockResolvedValueOnce({
      id: 7,
      username: "u",
      name: "U",
      avatarUrl: null,
      webhooks: [],
      teams: [
        {
          role,
          team: { id: 42, name: "Team", slug: "team", logoUrl: null, webhooks: [makeWebhook()] },
        },
      ],
    });

  it("hides the secret and denies modification for plain members", async () => {
    mockUserWithRole(MembershipRole.MEMBER);

    const { webhookGroups } = await repository.getFilteredWebhooksForUser({ userId: 7 });

    const teamGroup = webhookGroups.find((group) => group.teamId === 42);
    expect(teamGroup?.metadata).toEqual({ canModify: false, canDelete: false });
    expect(teamGroup?.webhooks[0].secret).toBeNull();
  });

  it.each([MembershipRole.ADMIN, MembershipRole.OWNER])("grants full access to %s", async (role) => {
    mockUserWithRole(role);

    const { webhookGroups } = await repository.getFilteredWebhooksForUser({ userId: 7 });

    const teamGroup = webhookGroups.find((group) => group.teamId === 42);
    expect(teamGroup?.metadata).toEqual({ canModify: true, canDelete: true });
    expect(teamGroup?.webhooks[0].secret).toBe("s3cr3t");
  });
});
