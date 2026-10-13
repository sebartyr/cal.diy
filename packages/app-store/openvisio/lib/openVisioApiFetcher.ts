import { handleErrorsJson } from "@calcom/lib/errors";
import { z } from "zod";
import { getOpenVisioAppKeys } from "./getOpenVisioAppKeys";

// La Suite Meet exposes its third-party integration surface under a versioned external API.
const EXTERNAL_API_PATH = "/external-api/v1.0";
const OAUTH2_GRANT_TYPE_CLIENT_CREDENTIALS = "client_credentials";
// Renew slightly before real expiry to avoid racing the token's TTL on slow requests.
const TOKEN_EXPIRY_SKEW_MS = 30_000;

const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string().default("Bearer"),
  expires_in: z.number(),
});

type CachedToken = { authorization: string; expiresAt: number };

// Delegated tokens are scoped to a single user (the booking organizer), so we cache per email.
const tokenCache = new Map<string, CachedToken>();

async function getDelegatedAuthorization(organizerEmail: string): Promise<string> {
  const cached = tokenCache.get(organizerEmail);
  if (cached && cached.expiresAt - TOKEN_EXPIRY_SKEW_MS > Date.now()) {
    return cached.authorization;
  }

  const { apiBaseUrl, clientId, clientSecret } = await getOpenVisioAppKeys();
  const response = await fetch(`${apiBaseUrl}${EXTERNAL_API_PATH}/application/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: OAUTH2_GRANT_TYPE_CLIENT_CREDENTIALS,
      // OpenVisio resolves (or provisions) the Meet user from this email and returns a token
      // that acts on their behalf, so we never have to resolve the user id ourselves.
      scope: organizerEmail,
    }),
  }).then(handleErrorsJson);

  const { access_token, token_type, expires_in } = tokenResponseSchema.parse(response);
  const authorization = `${token_type} ${access_token}`;
  tokenCache.set(organizerEmail, {
    authorization,
    expiresAt: Date.now() + expires_in * 1000,
  });
  return authorization;
}

/**
 * Calls the OpenVisio external API on behalf of `organizerEmail`, transparently minting and
 * caching the delegated access token required by `ApplicationJWTAuthentication`.
 */
export const openVisioFetcher = async <Type>(
  organizerEmail: string,
  endpoint: string,
  init?: RequestInit
): Promise<Type> => {
  const { apiBaseUrl } = await getOpenVisioAppKeys();
  const authorization = await getDelegatedAuthorization(organizerEmail);
  return fetch(`${apiBaseUrl}${EXTERNAL_API_PATH}${endpoint}`, {
    method: "GET",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  }).then(handleErrorsJson<Type>);
};
