import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserTopBannersHandler } from "./getUserTopBanners.handler";

const { mockCheckInvalidAppCredentials, mockCountPendingByUserId } = vi.hoisted(() => ({
  mockCheckInvalidAppCredentials: vi.fn(),
  mockCountPendingByUserId: vi.fn(),
}));

vi.mock("./checkForInvalidAppCredentials", () => ({
  checkInvalidAppCredentials: mockCheckInvalidAppCredentials,
}));

vi.mock("@calcom/features/membership/repositories/MembershipRepository", () => ({
  MembershipRepository: class {
    countPendingByUserId = mockCountPendingByUserId;
  },
}));

const buildUser = (overrides: Partial<NonNullable<TrpcSessionUser>>) =>
  ({
    id: 1,
    email: "user@example.com",
    emailVerified: null,
    identityProvider: "CAL",
    ...overrides,
  }) as NonNullable<TrpcSessionUser>;

describe("getUserTopBannersHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountPendingByUserId.mockResolvedValue(0);
  });

  it("returns the full banner payload with the upgrade banners disabled", async () => {
    const invalidApps = [{ name: "Zoom", slug: "zoom" }];
    mockCheckInvalidAppCredentials.mockResolvedValue(invalidApps);

    const result = await getUserTopBannersHandler({ ctx: { user: buildUser({}) } });

    expect(result).toEqual({
      teamUpgradeBanner: null,
      orgUpgradeBanner: false,
      verifyEmailBanner: true,
      calendarCredentialBanner: false,
      invalidAppCredentialBanners: invalidApps,
      pendingTeamInvitesBanner: 0,
      dueInvoiceBanner: null,
    });
    expect(mockCheckInvalidAppCredentials).toHaveBeenCalledTimes(1);
  });

  it("hides the verify email banner for verified users", async () => {
    mockCheckInvalidAppCredentials.mockResolvedValue([]);

    const result = await getUserTopBannersHandler({
      ctx: { user: buildUser({ emailVerified: new Date() }) },
    });

    expect(result.verifyEmailBanner).toBe(false);
  });

  it("falls back to no invalid credential banner when the check fails", async () => {
    mockCheckInvalidAppCredentials.mockRejectedValue(new Error("db down"));

    const result = await getUserTopBannersHandler({ ctx: { user: buildUser({}) } });

    expect(result.invalidAppCredentialBanners).toEqual([]);
  });

  it("exposes the number of pending team invites", async () => {
    mockCheckInvalidAppCredentials.mockResolvedValue([]);
    mockCountPendingByUserId.mockResolvedValue(2);

    const result = await getUserTopBannersHandler({ ctx: { user: buildUser({ id: 42 }) } });

    expect(result.pendingTeamInvitesBanner).toBe(2);
    expect(mockCountPendingByUserId).toHaveBeenCalledWith({ userId: 42 });
  });

  it("hides the pending invites banner when the count fails", async () => {
    mockCheckInvalidAppCredentials.mockResolvedValue([]);
    mockCountPendingByUserId.mockRejectedValue(new Error("db down"));

    const result = await getUserTopBannersHandler({ ctx: { user: buildUser({}) } });

    expect(result.pendingTeamInvitesBanner).toBe(0);
  });
});
