import { createHmac, timingSafeEqual } from "node:crypto";
import process from "node:process";
import type { NextApiRequest } from "next";
import type { IntegrationOAuthCallbackState } from "../../types";

/**
 * SEC-101: apps whose OAuth-callback page does NOT yet wire `encodeOAuthState`
 * on the /add side, so decodeOAuthState can't enforce a nonce here without
 * breaking the install flow. Each entry here is a follow-up obligation — add
 * encodeOAuthState in the corresponding `api/add.ts` and remove the entry.
 *
 * Stripe was removed in SPRINT2-010 (encodeOAuthState wired on /add).
 * The remaining four are tracked in OPS_TODO + sprint plan; their /add
 * routes either pass state="" (webex) or no state at all (basecamp3, dub,
 * tandem). Until each is fixed individually, exempting them prevents the
 * decode helper from returning `undefined` and breaking their install path.
 */
const NONCE_EXEMPT_APPS = new Set(["basecamp3", "dub", "webex", "tandem"]);

export function decodeOAuthState(req: NextApiRequest, appSlug?: string) {
  if (typeof req.query.state !== "string") {
    return undefined;
  }
  const state: IntegrationOAuthCallbackState = JSON.parse(req.query.state);

  if (appSlug && NONCE_EXEMPT_APPS.has(appSlug)) {
    return state;
  }

  if (!state.nonce || !state.nonceHash) {
    return undefined;
  }

  const userId = req.session?.user?.id;
  if (!userId || !process.env.NEXTAUTH_SECRET) {
    return undefined;
  }
  const expected = createHmac("sha256", process.env.NEXTAUTH_SECRET)
    .update(`${state.nonce}:${userId}`)
    .digest();
  const actual = Buffer.from(state.nonceHash, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return undefined;
  }

  return state;
}
