import { beforeEach, describe, expect, it, vi } from "vitest";

import { MembershipRole } from "@calcom/prisma/enums";

const eventTypeFindUnique = vi.fn();
const membershipFindUnique = vi.fn();

vi.mock("@calcom/prisma", () => ({
  prisma: {
    eventType: { findUnique: (args: unknown) => eventTypeFindUnique(args) },
    membership: { findUnique: (args: unknown) => membershipFindUnique(args) },
  },
}));

import {
  assertCanAccessWebhook,
  canManageEventType,
  isTeamAdminOrOwner,
} from "../authorization-clever";

beforeEach(() => {
  eventTypeFindUnique.mockReset();
  membershipFindUnique.mockReset();
});

describe("canManageEventType (FORK-300-FORK)", () => {
  it("returns false when the event type does not exist", async () => {
    eventTypeFindUnique.mockResolvedValueOnce(null);
    expect(await canManageEventType(1, 99)).toBe(false);
  });

  it("returns true for the owner of a user-owned event type", async () => {
    eventTypeFindUnique.mockResolvedValueOnce({ id: 1, userId: 7, teamId: null });
    expect(await canManageEventType(1, 7)).toBe(true);
  });

  it("returns false for a non-owner of a user-owned event type", async () => {
    eventTypeFindUnique.mockResolvedValueOnce({ id: 1, userId: 7, teamId: null });
    expect(await canManageEventType(1, 8)).toBe(false);
  });

  it("returns true for ADMIN of the owning team", async () => {
    eventTypeFindUnique.mockResolvedValueOnce({ id: 1, userId: null, teamId: 42 });
    membershipFindUnique.mockResolvedValueOnce({ role: MembershipRole.ADMIN, accepted: true });
    expect(await canManageEventType(1, 7)).toBe(true);
  });

  it("returns true for OWNER of the owning team", async () => {
    eventTypeFindUnique.mockResolvedValueOnce({ id: 1, userId: null, teamId: 42 });
    membershipFindUnique.mockResolvedValueOnce({ role: MembershipRole.OWNER, accepted: true });
    expect(await canManageEventType(1, 7)).toBe(true);
  });

  it("returns false for MEMBER of the owning team", async () => {
    eventTypeFindUnique.mockResolvedValueOnce({ id: 1, userId: null, teamId: 42 });
    membershipFindUnique.mockResolvedValueOnce({ role: MembershipRole.MEMBER, accepted: true });
    expect(await canManageEventType(1, 7)).toBe(false);
  });

  it("returns false when the team membership is unaccepted", async () => {
    eventTypeFindUnique.mockResolvedValueOnce({ id: 1, userId: null, teamId: 42 });
    membershipFindUnique.mockResolvedValueOnce({ role: MembershipRole.ADMIN, accepted: false });
    expect(await canManageEventType(1, 7)).toBe(false);
  });
});

describe("isTeamAdminOrOwner", () => {
  it("returns false when there is no membership", async () => {
    membershipFindUnique.mockResolvedValueOnce(null);
    expect(await isTeamAdminOrOwner({ userId: 7, teamId: 42 })).toBe(false);
  });

  it("returns true for OWNER+accepted", async () => {
    membershipFindUnique.mockResolvedValueOnce({ role: MembershipRole.OWNER, accepted: true });
    expect(await isTeamAdminOrOwner({ userId: 7, teamId: 42 })).toBe(true);
  });
});

describe("assertCanAccessWebhook", () => {
  it("delegates to canManageEventType for event-typed webhooks", async () => {
    eventTypeFindUnique.mockResolvedValueOnce({ id: 1, userId: 7, teamId: null });
    await expect(
      assertCanAccessWebhook({
        webhook: { userId: null, teamId: null, eventTypeId: 1 },
        userId: 7,
      })
    ).resolves.toBeUndefined();
  });

  it("throws FORBIDDEN when event-type check fails", async () => {
    eventTypeFindUnique.mockResolvedValueOnce(null);
    await expect(
      assertCanAccessWebhook({
        webhook: { userId: null, teamId: null, eventTypeId: 1 },
        userId: 7,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires ADMIN/OWNER for team-scoped webhooks", async () => {
    membershipFindUnique.mockResolvedValueOnce({ role: MembershipRole.MEMBER, accepted: true });
    await expect(
      assertCanAccessWebhook({
        webhook: { userId: null, teamId: 42, eventTypeId: null },
        userId: 7,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows ADMIN of the team", async () => {
    membershipFindUnique.mockResolvedValueOnce({ role: MembershipRole.ADMIN, accepted: true });
    await expect(
      assertCanAccessWebhook({
        webhook: { userId: null, teamId: 42, eventTypeId: null },
        userId: 7,
      })
    ).resolves.toBeUndefined();
  });

  it("requires identity for user-owned webhooks", async () => {
    await expect(
      assertCanAccessWebhook({
        webhook: { userId: 7, teamId: null, eventTypeId: null },
        userId: 7,
      })
    ).resolves.toBeUndefined();

    await expect(
      assertCanAccessWebhook({
        webhook: { userId: 7, teamId: null, eventTypeId: null },
        userId: 8,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies orphan webhooks (no scope)", async () => {
    await expect(
      assertCanAccessWebhook({
        webhook: { userId: null, teamId: null, eventTypeId: null },
        userId: 7,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
