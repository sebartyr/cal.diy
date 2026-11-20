import { createHmac, timingSafeEqual } from "node:crypto";
import { isOriginAllowed } from "@/lib/is-origin-allowed/is-origin-allowed";

export type OAuthCallbackState = {
  accessToken: string;
  teamId?: string;
  orgId?: string;
  fromApp?: boolean;
  returnTo?: string;
  onErrorReturnTo?: string;
};

type SignedOAuthCallbackState = OAuthCallbackState & { sig: string };

// The state travels through the OAuth provider and comes back on an unauthenticated callback that
// redirects to returnTo / onErrorReturnTo, so it is signed to stop anyone from forging those URLs.
const sign = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(`conferencing-oauth-state:${payload}`).digest("base64url");

export function signOAuthCallbackState(state: OAuthCallbackState, secret: string): SignedOAuthCallbackState {
  return { ...state, sig: sign(JSON.stringify(state), secret) };
}

export function verifyOAuthCallbackState(rawState: string, secret: string): OAuthCallbackState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawState);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const { sig, ...state } = parsed as Partial<SignedOAuthCallbackState>;
  if (typeof sig !== "string" || typeof state.accessToken !== "string") return null;

  const expected = Buffer.from(sign(JSON.stringify(state), secret));
  const provided = Buffer.from(sig);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  return state as OAuthCallbackState;
}

/**
 * Signing only proves the state came from us, not that its destinations are safe: whoever requests the
 * auth URL chooses them. They must be http(s) and match the web app or an allowed redirect URI of the
 * caller's OAuth client: an origin (wildcards allowed, as for request origins) or an exact full URL.
 */
export function isAllowedReturnUrl(url: string, allowed: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  // A wildcard pattern would also match text in the path or query of a full URL, so only exact entries
  // are compared with the full URL.
  return isOriginAllowed(parsed.origin, allowed) || allowed.some((entry) => !entry.includes("*") && entry === url);
}
