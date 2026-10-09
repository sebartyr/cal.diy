import { IdentityProvider } from "@calcom/prisma/enums";
import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";

const {
  mockFindAllProfilesForUserIncludingMovedUser,
  mockFindUnique,
  mockFindMany,
  mockUserFindUnique,
  mockGetTeamIdsWithPermission,
  mockEnrichUserWithTheProfile,
} = vi.hoisted(() => ({
  mockFindAllProfilesForUserIncludingMovedUser: vi.fn(),
  mockFindUnique: vi.fn(),
  mockFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockGetTeamIdsWithPermission: vi.fn(),
  mockEnrichUserWithTheProfile: vi.fn(),
}));

vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  ProfileRepository: {
    findAllProfilesForUserIncludingMovedUser: (...args: unknown[]) =>
      mockFindAllProfilesForUserIncludingMovedUser(...args),
    buildPersonalProfileFromUser: vi.fn(() => ({ upId: "usr_1" })),
  },
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {
    enrichUserWithTheProfile(...args: unknown[]) {
      return mockEnrichUserWithTheProfile(...args);
    }
  },
}));

vi.mock("@calcom/features/membership/di/TeamRolePermissionService.container", () => ({
  getTeamRolePermissionService: () => ({ getTeamIdsWithPermission: mockGetTeamIdsWithPermission }),
}));

vi.mock("@calcom/lib/getAvatarUrl", () => ({
  getUserAvatarUrl: vi.fn(() => "https://avatar.example.com/1"),
}));

vi.mock("@calcom/prisma", () => ({
  default: {
    secondaryEmail: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    account: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

import { getHandler } from "./get.handler";

describe("getHandler - identity provider email lookup", () => {
  const baseUser = {
    id: 1,
    name: "Test User",
    email: "test@example.com",
    username: "testuser",
    emailVerified: new Date(),
    bufferTime: 0,
    locale: "en",
    timeFormat: 12,
    timeZone: "UTC",
    avatar: null,
    avatarUrl: null,
    createdDate: new Date(),
    trialEndsAt: null,
    defaultScheduleId: null,
    completedOnboarding: true,
    twoFactorEnabled: false,
    brandColor: "#000000",
    darkBrandColor: "#ffffff",
    bio: null,
    weekStart: "Monday",
    theme: null,
    appTheme: null,
    hideBranding: false,
    metadata: null,
    defaultBookerLayouts: null,
    allowDynamicBooking: true,
    allowSEOIndexing: true,
    receiveMonthlyDigestEmail: true,
    requiresBookerEmailVerification: false,
    role: "USER",
    identityProvider: IdentityProvider.CAL,
    identityProviderId: null as string | null,
    organization: null,
    profile: { upId: "usr_1", organizationId: null, username: null } as {
      upId: string;
      organizationId: number | null;
      username: string | null;
    } | null,
    teams: [],
  };

  function createCtx(overrides: Partial<typeof baseUser> = {}) {
    return {
      user: { ...baseUser, ...overrides } as unknown as NonNullable<TrpcSessionUser>,
      session: { upId: "usr_1" } as unknown as Session,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockFindAllProfilesForUserIncludingMovedUser.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);
    mockGetTeamIdsWithPermission.mockResolvedValue([]);
    mockFindUnique.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(null);
  });

  it("maps AZUREAD identity provider to 'azure-ad' in account lookup", async () => {
    const ctx = createCtx({
      identityProvider: IdentityProvider.AZUREAD,
      identityProviderId: "azure-provider-id-123",
    });
    mockFindUnique.mockResolvedValue({ providerEmail: "azure@example.com" });

    const result = await getHandler({ ctx, input: {} });

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerAccountId: {
            provider: "azure-ad",
            providerAccountId: "azure-provider-id-123",
          },
        },
      })
    );
    expect(result.identityProviderEmail).toBe("azure@example.com");
  });

  it("maps GOOGLE identity provider to 'google' in account lookup", async () => {
    const ctx = createCtx({
      identityProvider: IdentityProvider.GOOGLE,
      identityProviderId: "google-id-456",
    });
    mockFindUnique.mockResolvedValue({ providerEmail: "google@example.com" });

    const result = await getHandler({ ctx, input: {} });

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: "google-id-456",
          },
        },
      })
    );
    expect(result.identityProviderEmail).toBe("google@example.com");
  });

  it("maps CAL identity provider to 'cal' in account lookup", async () => {
    const ctx = createCtx({
      identityProvider: IdentityProvider.CAL,
      identityProviderId: "cal-id-789",
    });
    mockFindUnique.mockResolvedValue(null);

    const result = await getHandler({ ctx, input: {} });

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerAccountId: {
            provider: "cal",
            providerAccountId: "cal-id-789",
          },
        },
      })
    );
    expect(result.identityProviderEmail).toBe("");
  });

  it("returns empty string when no account found", async () => {
    const ctx = createCtx({
      identityProvider: IdentityProvider.AZUREAD,
      identityProviderId: "nonexistent-id",
    });
    mockFindUnique.mockResolvedValue(null);

    const result = await getHandler({ ctx, input: {} });

    expect(result.identityProviderEmail).toBe("");
  });

  it("sets canUpdateTeams only when the user is ADMIN or OWNER of at least one team", async () => {
    mockGetTeamIdsWithPermission.mockResolvedValueOnce([]);
    const withoutTeams = await getHandler({ ctx: createCtx(), input: {} });
    expect(withoutTeams.canUpdateTeams).toBe(false);

    mockGetTeamIdsWithPermission.mockResolvedValueOnce([42]);
    const withAdminTeam = await getHandler({ ctx: createCtx(), input: {} });
    expect(withAdminTeam.canUpdateTeams).toBe(true);

    expect(mockGetTeamIdsWithPermission).toHaveBeenCalledWith({
      userId: baseUser.id,
      permission: "team.update",
      fallbackRoles: ["ADMIN", "OWNER"],
    });
  });

  it("uses the profile already loaded on ctx.user instead of reloading it", async () => {
    const result = await getHandler({
      ctx: createCtx({ profile: { upId: "usr_1", organizationId: null, username: "profile-username" } }),
      input: {},
    });

    expect(mockEnrichUserWithTheProfile).not.toHaveBeenCalled();
    expect(result.username).toBe("profile-username");
    expect(result.profile).toEqual({ upId: "usr_1", organizationId: null, username: "profile-username" });
  });

  it("reloads the profile when session.upId differs from the one on ctx.user", async () => {
    const orgProfile = { upId: "42", organizationId: 7, username: "org-username" };
    mockEnrichUserWithTheProfile.mockImplementation(({ user }: { user: object }) =>
      Promise.resolve({ ...user, profile: orgProfile })
    );
    const ctx = { ...createCtx(), session: { upId: "42" } as unknown as Session };

    const result = await getHandler({ ctx, input: {} });

    expect(mockEnrichUserWithTheProfile).toHaveBeenCalledWith({ user: ctx.user, upId: "42" });
    expect(result.organizationId).toBe(7);
    expect(result.username).toBe("org-username");
    expect(result.profile).toEqual(orgProfile);
  });

  it("computes passwordAdded for non-CAL users even without includePasswordAdded", async () => {
    mockUserFindUnique.mockResolvedValue({ password: { hash: "hash" } });

    const result = await getHandler({
      ctx: createCtx({ identityProvider: IdentityProvider.GOOGLE }),
      input: undefined,
    });

    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      select: { password: true },
    });
    expect(result.passwordAdded).toBe(true);
  });

  it("omits passwordAdded when a non-CAL user has no password", async () => {
    mockUserFindUnique.mockResolvedValue({ password: null });

    const result = await getHandler({
      ctx: createCtx({ identityProvider: IdentityProvider.GOOGLE }),
      input: { includePasswordAdded: true },
    });

    expect(result).not.toHaveProperty("passwordAdded");
  });

  it("skips the password and account lookups for CAL users without identity provider id", async () => {
    const result = await getHandler({ ctx: createCtx(), input: { includePasswordAdded: true } });

    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("passwordAdded");
    expect(result.identityProviderEmail).toBe("");
  });

  it("starts all independent lookups before any of them resolves", async () => {
    const pending: Array<() => void> = [];
    const deferred = <T>(value: T) =>
      new Promise<T>((resolve) => {
        pending.push(() => resolve(value));
      });
    mockFindAllProfilesForUserIncludingMovedUser.mockImplementation(() => deferred([]));
    mockFindMany.mockImplementation(() => deferred([]));
    mockUserFindUnique.mockImplementation(() => deferred(null));
    mockFindUnique.mockImplementation(() => deferred(null));
    mockGetTeamIdsWithPermission.mockImplementation(() => deferred([]));

    const resultPromise = getHandler({
      ctx: createCtx({ identityProvider: IdentityProvider.GOOGLE, identityProviderId: "google-id" }),
      input: {},
    });
    await vi.waitFor(() => expect(pending).toHaveLength(5));

    for (const resolve of pending) resolve();
    await expect(resultPromise).resolves.toMatchObject({ id: baseUser.id, canUpdateTeams: false });
  });
});
