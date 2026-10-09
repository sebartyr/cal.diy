import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserTopBannersHandler } from "./getUserTopBanners.handler";

const { mockCheckInvalidAppCredentials } = vi.hoisted(() => ({
  mockCheckInvalidAppCredentials: vi.fn(),
}));

vi.mock("./checkForInvalidAppCredentials", () => ({
  checkInvalidAppCredentials: mockCheckInvalidAppCredentials,
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
});
