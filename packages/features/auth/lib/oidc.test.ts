import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OidcClient, OidcProfileClaims, OidcTokens } from "./oidc";
import {
  buildOidcAccountId,
  fetchOidcProfile,
  mapOidcProfileToUser,
  mergeOidcProfile,
  toOidcProfileClaims,
} from "./oidc";

vi.mock("@calcom/lib/logger", () => ({
  default: {
    getSubLogger: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

const ISSUER = "https://idp.example.com/realms/cal";

const encodeSegment = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** The signature is irrelevant here: it was already verified during the code exchange. */
const buildTokens = (claims: OidcProfileClaims): OidcTokens => ({
  id_token: `${encodeSegment({ alg: "RS256", typ: "JWT" })}.${encodeSegment(claims)}.signature`,
  access_token: "access-token",
});

const buildClient = ({
  userinfo,
  hasUserinfoEndpoint = true,
}: {
  userinfo: OidcClient["userinfo"];
  hasUserinfoEndpoint?: boolean;
}): OidcClient => ({
  issuer: {
    metadata: hasUserinfoEndpoint ? { userinfo_endpoint: `${ISSUER}/protocol/openid-connect/userinfo` } : {},
  },
  userinfo,
});

describe("buildOidcAccountId", () => {
  it("namespaces the subject with the issuer", () => {
    const accountId = buildOidcAccountId({ issuer: ISSUER, sub: "abc-123" });

    expect(accountId).toMatch(/^[0-9a-f]{16}:abc-123$/);
  });

  it("is stable for the same issuer", () => {
    expect(buildOidcAccountId({ issuer: ISSUER, sub: "abc-123" })).toBe(
      buildOidcAccountId({ issuer: ISSUER, sub: "abc-123" })
    );
  });

  it("ignores a trailing slash on the issuer", () => {
    expect(buildOidcAccountId({ issuer: `${ISSUER}/`, sub: "abc-123" })).toBe(
      buildOidcAccountId({ issuer: ISSUER, sub: "abc-123" })
    );
  });

  it("yields a different id when the issuer changes, so a reused `sub` cannot collide", () => {
    expect(buildOidcAccountId({ issuer: "https://other-idp.example.com", sub: "abc-123" })).not.toBe(
      buildOidcAccountId({ issuer: ISSUER, sub: "abc-123" })
    );
  });

  it("throws when no issuer is available", () => {
    expect(() => buildOidcAccountId({ issuer: undefined, sub: "abc-123" })).toThrow(/no issuer/);
  });
});

describe("toOidcProfileClaims", () => {
  it("keeps the claims it knows about and passes unknown ones through", () => {
    expect(
      toOidcProfileClaims({
        sub: "abc-123",
        iss: ISSUER,
        email: "user@example.com",
        email_verified: true,
        groups: ["staff"],
      })
    ).toMatchObject({
      sub: "abc-123",
      iss: ISSUER,
      email: "user@example.com",
      email_verified: true,
      groups: ["staff"],
    });
  });

  it("accepts a string-serialised email_verified", () => {
    expect(toOidcProfileClaims({ email_verified: "true" }).email_verified).toBe(true);
    expect(toOidcProfileClaims({ email_verified: "false" }).email_verified).toBe(false);
  });

  it("drops an email_verified value that asserts nothing", () => {
    expect(toOidcProfileClaims({ email_verified: 1 }).email_verified).toBeUndefined();
    expect(toOidcProfileClaims({ email_verified: "yes" }).email_verified).toBeUndefined();
  });

  it("drops claims whose type does not match", () => {
    expect(toOidcProfileClaims({ sub: 42, email: { value: "user@example.com" } })).toMatchObject({
      sub: undefined,
      email: undefined,
    });
  });

  it("returns an empty claim set for a non-object payload", () => {
    expect(toOidcProfileClaims(null)).toEqual({});
    expect(toOidcProfileClaims("not-a-profile")).toEqual({});
  });
});

describe("mergeOidcProfile", () => {
  it("returns the ID token claims when there is no UserInfo response", () => {
    const claims: OidcProfileClaims = { sub: "abc-123", email: "user@example.com" };

    expect(mergeOidcProfile(claims, undefined)).toEqual(claims);
  });

  it("fills in claims the ID token omitted", () => {
    const merged = mergeOidcProfile(
      { sub: "abc-123", iss: ISSUER },
      { sub: "abc-123", email: "user@example.com", email_verified: true, name: "User" }
    );

    expect(merged).toEqual({
      sub: "abc-123",
      iss: ISSUER,
      email: "user@example.com",
      email_verified: true,
      name: "User",
    });
  });

  it("keeps the ID token value when both sources define a claim", () => {
    const merged = mergeOidcProfile(
      { sub: "abc-123", email_verified: false },
      { sub: "abc-123", email_verified: true }
    );

    expect(merged.email_verified).toBe(false);
  });

  it("does not let an undefined token claim erase the UserInfo value", () => {
    const merged = mergeOidcProfile(
      { sub: "abc-123", email: undefined },
      { sub: "abc-123", email: "user@example.com" }
    );

    expect(merged.email).toBe("user@example.com");
  });

  it("rejects a UserInfo response describing another subject", () => {
    expect(() => mergeOidcProfile({ sub: "abc-123" }, { sub: "other-sub" })).toThrow(
      /does not match the ID token/
    );
  });

  it("rejects a UserInfo response that asserts no subject", () => {
    expect(() =>
      mergeOidcProfile({ sub: "abc-123" }, { email: "user@example.com", email_verified: true })
    ).toThrow(/UserInfo response is missing the `sub` claim/);
  });

  it("rejects a merge when the ID token itself asserts no subject", () => {
    expect(() => mergeOidcProfile({}, { sub: "abc-123", email_verified: true })).toThrow(
      /ID token is missing the `sub` claim/
    );
  });
});

describe("fetchOidcProfile", () => {
  it("merges UserInfo into the ID token claims", async () => {
    const userinfo = vi.fn().mockResolvedValue({
      sub: "abc-123",
      email: "user@example.com",
      email_verified: true,
      name: "User",
    });

    const profile = await fetchOidcProfile({
      tokens: buildTokens({ sub: "abc-123", iss: ISSUER }),
      client: buildClient({ userinfo }),
    });

    expect(userinfo).toHaveBeenCalledTimes(1);
    expect(profile).toMatchObject({
      sub: "abc-123",
      email: "user@example.com",
      email_verified: true,
      name: "User",
    });
  });

  it("skips the request when the IdP advertises no UserInfo endpoint", async () => {
    const userinfo = vi.fn();

    const profile = await fetchOidcProfile({
      tokens: buildTokens({ sub: "abc-123", email: "user@example.com", email_verified: true }),
      client: buildClient({ userinfo, hasUserinfoEndpoint: false }),
    });

    expect(userinfo).not.toHaveBeenCalled();
    expect(profile.email).toBe("user@example.com");
  });

  it("falls back to the ID token claims when the UserInfo request fails", async () => {
    const userinfo = vi.fn().mockRejectedValue(new Error("503 Service Unavailable"));

    const profile = await fetchOidcProfile({
      tokens: buildTokens({ sub: "abc-123", email: "user@example.com", email_verified: true }),
      client: buildClient({ userinfo }),
    });

    expect(profile).toEqual({ sub: "abc-123", email: "user@example.com", email_verified: true });
  });

  it("propagates a subject mismatch instead of trusting the UserInfo response", async () => {
    const userinfo = vi.fn().mockResolvedValue({ sub: "other-sub", email: "attacker@example.com" });

    await expect(
      fetchOidcProfile({
        tokens: buildTokens({ sub: "abc-123" }),
        client: buildClient({ userinfo }),
      })
    ).rejects.toThrow(/does not match the ID token/);
  });

  // openid-client does not compare the subjects for us here, since it is handed the raw
  // access token rather than a TokenSet.
  it("rejects a UserInfo response with no subject to compare against", async () => {
    const userinfo = vi.fn().mockResolvedValue({ email: "attacker@example.com", email_verified: true });

    await expect(
      fetchOidcProfile({
        tokens: buildTokens({ sub: "abc-123" }),
        client: buildClient({ userinfo }),
      })
    ).rejects.toThrow(/UserInfo response is missing the `sub` claim/);
  });

  it("rejects the merge when the ID token carries no subject", async () => {
    const userinfo = vi.fn().mockResolvedValue({ sub: "abc-123", email_verified: true });

    await expect(
      fetchOidcProfile({
        tokens: buildTokens({ iss: ISSUER }),
        client: buildClient({ userinfo }),
      })
    ).rejects.toThrow(/ID token is missing the `sub` claim/);
  });
});

describe("mapOidcProfileToUser", () => {
  it("maps the claims onto the NextAuth user shape", () => {
    const user = mapOidcProfileToUser({
      sub: "abc-123",
      iss: ISSUER,
      email: "user@example.com",
      name: "User",
      picture: "https://idp.example.com/avatar.png",
    });

    expect(user).toEqual({
      id: buildOidcAccountId({ issuer: ISSUER, sub: "abc-123" }),
      name: "User",
      email: "user@example.com",
      image: "https://idp.example.com/avatar.png",
    });
  });

  it("falls back to preferred_username then email when `name` is absent", () => {
    expect(
      mapOidcProfileToUser({ sub: "abc-123", iss: ISSUER, preferred_username: "user", email: "u@e.com" }).name
    ).toBe("user");
    expect(mapOidcProfileToUser({ sub: "abc-123", iss: ISSUER, email: "u@e.com" }).name).toBe("u@e.com");
    expect(mapOidcProfileToUser({ sub: "abc-123", iss: ISSUER }).name).toBeNull();
  });

  it("throws when the profile has no `sub` claim", () => {
    expect(() => mapOidcProfileToUser({ iss: ISSUER, email: "user@example.com" })).toThrow(/sub/);
  });
});

describe("mapOidcProfileToUser without an `iss` claim", () => {
  const originalIssuer = process.env.OIDC_ISSUER;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalIssuer === undefined) {
      delete process.env.OIDC_ISSUER;
    } else {
      process.env.OIDC_ISSUER = originalIssuer;
    }
    vi.resetModules();
  });

  it("falls back to the configured issuer", async () => {
    process.env.OIDC_ISSUER = ISSUER;
    const oidc = await import("./oidc");

    expect(oidc.mapOidcProfileToUser({ sub: "abc-123" }).id).toBe(
      oidc.buildOidcAccountId({ issuer: ISSUER, sub: "abc-123" })
    );
  });

  it("throws when neither the claim nor the configuration provides an issuer", async () => {
    delete process.env.OIDC_ISSUER;
    const oidc = await import("./oidc");

    expect(() => oidc.mapOidcProfileToUser({ sub: "abc-123" })).toThrow(/no issuer/);
  });
});
