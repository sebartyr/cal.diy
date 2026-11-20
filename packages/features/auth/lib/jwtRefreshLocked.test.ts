/**
 * The jwt callback refreshes sessions through autoMergeIdentities: it must refuse a locked user so
 * that NextAuth drops the session instead of extending it.
 */
import type { Adapter } from "next-auth/adapters";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@calcom/prisma", () => ({
  prisma: { user: { update: vi.fn() } },
  default: { user: { update: vi.fn() } },
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: vi.fn().mockImplementation(function () {
    return { findByEmailAndIncludeProfilesAndPassword: vi.fn() };
  }),
}));

vi.mock("@calcom/lib/checkRateLimitAndThrowError", () => ({
  checkRateLimitAndThrowError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@calcom/lib/server/PiiHasher", () => ({
  hashEmail: vi.fn((email: string) => `hashed_${email}`),
}));

vi.mock("@calcom/lib/crypto", () => ({
  symmetricDecrypt: vi.fn(),
  symmetricEncrypt: vi.fn(),
}));

vi.mock("@calcom/lib/auth/isPasswordValid", () => ({
  isPasswordValid: vi.fn(),
}));

vi.mock("@calcom/lib/env", () => ({ isENVDev: false }));

vi.mock("@calcom/lib/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@calcom/lib/constants")>();
  return {
    ...actual,
    IS_TEAM_BILLING_ENABLED: false,
    ENABLE_PROFILE_SWITCHER: false,
    WEBAPP_URL: "http://localhost:3000",
  };
});

const mockLogger = vi.hoisted(() => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }));
vi.mock("@calcom/lib/logger", () => ({ default: { getSubLogger: vi.fn(() => mockLogger) } }));

vi.mock("@calcom/lib/safeStringify", () => ({
  safeStringify: vi.fn((obj) => JSON.stringify(obj)),
}));

const mockLinkAccount = vi.fn();
vi.mock("./next-auth-custom-adapter", () => ({
  default: vi.fn(() => ({ linkAccount: mockLinkAccount })),
}));

vi.mock("@calcom/i18n/server", () => ({
  getTranslation: vi.fn().mockResolvedValue((key: string) => key),
}));

const mockFindAllProfiles = vi.fn();
const mockFindByUpIdWithAuth = vi.fn();
vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  ProfileRepository: {
    findAllProfilesForUserIncludingMovedUser: (...args: unknown[]) => mockFindAllProfiles(...args),
    findByUpIdWithAuth: (...args: unknown[]) => mockFindByUpIdWithAuth(...args),
  },
}));

vi.mock("@calcom/features/credentials/repositories/CredentialRepository", () => ({
  CredentialRepository: {
    findFirstByAppIdAndUserId: vi.fn(),
    findFirstByUserIdAndType: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@calcom/features/credentials/services/CredentialDataService", () => ({
  buildCredentialCreateData: vi.fn((d: unknown) => d),
}));

vi.mock("@calcom/app-store/_utils/oauth/updateProfilePhotoMicrosoft", () => ({
  updateProfilePhotoMicrosoft: vi.fn(),
}));
vi.mock("@calcom/app-store/_utils/oauth/updateProfilePhotoGoogle", () => ({
  updateProfilePhotoGoogle: vi.fn(),
}));

vi.mock("@calcom/features/auth/lib/identityProviders", () => ({
  getIdentityProvider: vi.fn((provider: string) => {
    const map: Record<string, string> = {
      "azure-ad": "AZUREAD",
      google: "GOOGLE",
      oidc: "OIDC",
      saml: "SAML",
      "saml-idp": "SAML",
      cal: "CAL",
    };
    return map[provider] ?? null;
  }),
}));

vi.mock("@calcom/features/auth/lib/outlook", () => ({
  OUTLOOK_CLIENT_ID: "mock-client-id",
  OUTLOOK_CLIENT_SECRET: "mock-client-secret",
  OUTLOOK_LOGIN_ENABLED: true,
}));

vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
vi.mock("@calcom/lib/default-cookies", () => ({ defaultCookies: vi.fn(() => ({})) }));
vi.mock("@calcom/lib/random", () => ({ randomString: vi.fn(() => "abc123") }));
vi.mock("@calcom/lib/slugify", () => ({ default: vi.fn((s: string) => s.toLowerCase()) }));
vi.mock("@calcom/app-store/googlecalendar/lib/CalendarService", () => ({
  createGoogleCalendarServiceWithGoogleType: vi.fn(),
}));
vi.mock("googleapis-common", () => ({ OAuth2Client: vi.fn() }));
vi.mock("@googleapis/calendar", () => ({ calendar_v3: { Calendar: vi.fn() } }));
vi.mock("next-auth/jwt", () => ({ encode: vi.fn() }));
vi.mock("./signJwt", () => ({ default: vi.fn().mockResolvedValue("mock-jwt") }));
vi.mock("./verifyTotpLoginJwt", () => ({ verifyTotpLoginJwt: vi.fn() }));
vi.mock("./dub", () => ({ dub: { track: { lead: vi.fn() } } }));
vi.mock("../signup/utils/getOrgUsernameFromEmail", () => ({
  getOrgUsernameFromEmail: vi.fn((email: string) => email.split("@")[0]),
}));
vi.mock("next-auth/providers/azure-ad", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/credentials", () => ({ default: vi.fn(() => ({ id: "credentials" })) }));
vi.mock("next-auth/providers/email", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));

const mockPrismaUserFindFirst = vi.fn();

describe("jwt callback refresh and locked accounts", () => {
  let jwtCallback: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const prismaModule = await import("@calcom/prisma");
    const prismaDefault = (prismaModule as any).default;
    prismaDefault.user = { ...prismaDefault.user, findFirst: mockPrismaUserFindFirst };
    prismaDefault.membership = { findUnique: vi.fn().mockResolvedValue(null) };

    mockFindAllProfiles.mockResolvedValue([{ id: 1, upId: "usr_1" }]);
    mockFindByUpIdWithAuth.mockResolvedValue({ id: 1, username: "testuser", organization: null });

    const adapterModule = await import("./next-auth-custom-adapter");
    vi.mocked(adapterModule.default).mockReturnValue({ linkAccount: mockLinkAccount } as unknown as Adapter);

    const { getOptions } = await import("./next-auth-options");
    const options = getOptions({ getDubId: () => undefined, getTrackingData: () => ({}) as any });
    jwtCallback = options.callbacks!.jwt;
  });

  it("refuses to refresh the session of a locked user", async () => {
    mockPrismaUserFindFirst.mockResolvedValue({
      id: 42,
      email: "victim@example.com",
      name: "Victim",
      username: "victim",
      role: "USER",
      locale: "en",
      avatarUrl: null,
      locked: true,
      movedToProfileId: null,
      teams: [],
    });

    const call = jwtCallback({
      token: { sub: "42", email: "victim@example.com", upId: "usr_1", role: "USER" },
      user: undefined,
      account: undefined,
      trigger: undefined,
      session: undefined,
    });

    await expect(call).rejects.toThrow();
  });
});
