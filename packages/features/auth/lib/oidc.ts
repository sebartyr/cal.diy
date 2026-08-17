import { createHash } from "node:crypto";
import process from "node:process";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import { decodeJwt } from "jose";

const log = logger.getSubLogger({ prefix: ["[oidc]"] });

const normalizeIssuer = (issuer: string) => issuer.trim().replace(/\/+$/, "");

const isDefined = (value: unknown) => value !== undefined && value !== null;

const asString = (value: unknown) => (typeof value === "string" ? value : undefined);

/**
 * `email_verified` is a boolean per OIDC Core, but a few IdPs serialise it as a string.
 * Anything else is treated as "not asserted" rather than as a truthy value.
 */
const asEmailVerified = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

export const OIDC_ISSUER = process.env.OIDC_ISSUER;
export const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID;
export const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET;
/** Label rendered on the login button, e.g. "Keycloak". */
export const OIDC_PROVIDER_NAME = process.env.OIDC_PROVIDER_NAME || "SSO";
export const OIDC_SCOPES = process.env.OIDC_SCOPES || "openid profile email";
export const IS_OIDC_LOGIN_ENABLED = !!(
  OIDC_ISSUER &&
  OIDC_CLIENT_ID &&
  OIDC_CLIENT_SECRET &&
  process.env.OIDC_LOGIN_ENABLED === "true"
);

/**
 * Discovery endpoint. Keycloak exposes it per realm, i.e. the issuer is
 * `${host}/realms/${realm}` and this resolves to `${issuer}/.well-known/openid-configuration`.
 */
export const OIDC_WELL_KNOWN = OIDC_ISSUER
  ? `${normalizeIssuer(OIDC_ISSUER)}/.well-known/openid-configuration`
  : undefined;

/** Claims of an OIDC profile, either from the ID token or from the UserInfo endpoint. */
export type OidcProfileClaims = {
  sub?: string;
  iss?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  picture?: string;
  image?: string;
  [claim: string]: unknown;
};

/** Shape of the user object NextAuth expects back from a provider's `profile()`. */
export type OidcProfileUser = {
  id: string;
  name: string | null;
  email?: string;
  image: string | null;
};

/**
 * `sub` is only unique within its own issuer, so persisting it alone means a replacement
 * IdP reusing a `sub` value would resolve to the account created for the previous one —
 * NextAuth looks the account up before `signIn()` ever runs. Namespacing the persisted id
 * with the issuer makes that collision impossible: a different issuer yields a different
 * `providerAccountId` and therefore a fresh account.
 *
 * The issuer is hashed rather than embedded verbatim to keep the identifier short and free
 * of URL punctuation; `sha256(issuer)` is stable, so the same issuer always maps back to the
 * same accounts. Truncating to 16 hex chars leaves 64 bits, far beyond what a per-deployment
 * set of issuers can collide on.
 */
export function buildOidcAccountId({ issuer, sub }: { issuer: string | undefined; sub: string }): string {
  const normalizedIssuer = issuer ? normalizeIssuer(issuer) : "";
  if (!normalizedIssuer) {
    throw new Error("Unable to build an OIDC account id: no issuer available for this profile");
  }
  const issuerKey = createHash("sha256").update(normalizedIssuer).digest("hex").slice(0, 16);
  return `${issuerKey}:${sub}`;
}

/**
 * Narrows an untrusted claim set — a decoded ID token payload or a UserInfo response — to the
 * claims this provider relies on, dropping values whose type does not match. Unknown claims are
 * kept as-is so downstream consumers can still read them.
 */
export function toOidcProfileClaims(raw: unknown): OidcProfileClaims {
  if (!raw || typeof raw !== "object") return {};
  const claims = raw as Record<string, unknown>;

  return {
    ...claims,
    sub: asString(claims.sub),
    iss: asString(claims.iss),
    email: asString(claims.email),
    email_verified: asEmailVerified(claims.email_verified),
    name: asString(claims.name),
    preferred_username: asString(claims.preferred_username),
    picture: asString(claims.picture),
  };
}

/**
 * Merges the UserInfo response into the ID token claims. A compliant IdP may release
 * `email`, `email_verified` or `name` through UserInfo only, in which case the ID token
 * alone yields an incomplete profile and the login is rejected downstream.
 *
 * ID token claims win over UserInfo when both are present: the token is signed and its
 * signature was verified during the code exchange, so a negative `email_verified` there
 * cannot be overridden by a laxer UserInfo response.
 */
export function mergeOidcProfile(
  idTokenClaims: OidcProfileClaims,
  userInfo: OidcProfileClaims | undefined
): OidcProfileClaims {
  if (!userInfo) return idTokenClaims;

  // OIDC Core 5.3.2: a UserInfo response whose `sub` differs from the ID token's must be
  // discarded — it belongs to another end user (or to a substituted response).
  if (idTokenClaims.sub && userInfo.sub && idTokenClaims.sub !== userInfo.sub) {
    throw new Error("OIDC UserInfo `sub` does not match the ID token `sub`");
  }

  const definedTokenClaims = Object.fromEntries(
    Object.entries(idTokenClaims).filter(([, value]) => isDefined(value))
  );

  return { ...userInfo, ...definedTokenClaims };
}

/**
 * Structural view of the `openid-client` client NextAuth hands to `userinfo.request`, kept
 * to what this module actually uses so the real client stays assignable to it.
 */
export type OidcClient = {
  issuer: { metadata: { userinfo_endpoint?: string } };
  userinfo: (accessToken: string) => Promise<unknown>;
};

/** Tokens as NextAuth types them at the `userinfo.request` stage. */
export type OidcTokens = {
  id_token?: string;
  access_token?: string;
};

/**
 * Profile resolution for the generic OIDC provider.
 *
 * NextAuth builds the raw profile from the ID token claims when `idToken: true` and never
 * calls UserInfo on its own, so this fills the gap: claims first, UserInfo merged on top of
 * whatever the token left out. UserInfo failures are non-fatal — a provider that only ships
 * claims in the token still logs in.
 *
 * The ID token signature was already verified during the code exchange, so decoding its
 * payload here is safe.
 */
export async function fetchOidcProfile({
  tokens,
  client,
}: {
  tokens: OidcTokens;
  client: OidcClient;
}): Promise<OidcProfileClaims> {
  const idTokenClaims = tokens.id_token ? toOidcProfileClaims(decodeJwt(tokens.id_token)) : {};

  if (!client.issuer.metadata.userinfo_endpoint || !tokens.access_token) return idTokenClaims;

  let userInfo: OidcProfileClaims | undefined;
  try {
    userInfo = toOidcProfileClaims(await client.userinfo(tokens.access_token));
  } catch (error) {
    log.warn(
      "UserInfo request failed, falling back to the ID token claims",
      safeStringify({ error: error instanceof Error ? error.message : error })
    );
    return idTokenClaims;
  }

  return mergeOidcProfile(idTokenClaims, userInfo);
}

export function mapOidcProfileToUser(profile: OidcProfileClaims): OidcProfileUser {
  if (!profile.sub) {
    throw new Error("OIDC profile is missing the `sub` claim");
  }

  return {
    id: buildOidcAccountId({ issuer: profile.iss ?? OIDC_ISSUER, sub: profile.sub }),
    // Keycloak only populates `name` when the user has both first and last name set,
    // and signIn() rejects nameless users, so fall back to the username.
    name: profile.name ?? profile.preferred_username ?? profile.email ?? null,
    email: profile.email,
    image: profile.picture ?? null,
  };
}
