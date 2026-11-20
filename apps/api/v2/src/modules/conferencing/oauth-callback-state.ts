import { createHmac, timingSafeEqual } from "node:crypto";

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
