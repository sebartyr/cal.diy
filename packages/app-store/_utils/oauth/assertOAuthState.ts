import type { NextApiResponse } from "next";

import type { IntegrationOAuthCallbackState } from "../../types";

/**
 * SEC-102: most OAuth callbacks (zoomvideo, office365calendar, googlecalendar,
 * feishucalendar, larkcalendar) call `decodeOAuthState(req)` but never bail
 * if the result is `undefined`. Combined with the apps being NOT on the
 * NONCE_EXEMPT allowlist, the practical result is:
 *
 *   - a legitimate /add → provider → callback flow carries a signed state
 *   - any *replayed* or *forged* callback (no /add visit, attacker-crafted
 *     URL emailed to a victim) has `state === undefined`, but the callback
 *     proceeds anyway and creates a Credential on the victim's account
 *
 * This helper short-circuits with a 400 in that case. If the state is
 * present (and was verified by decodeOAuthState), the helper returns it
 * narrowed to non-undefined so the caller can use it without `?.`.
 *
 * Returns `null` after responding — callers should `if (state === null) return;`
 * to keep the callback's existing control flow.
 */
export function assertOAuthState(
  state: IntegrationOAuthCallbackState | undefined,
  res: NextApiResponse
): IntegrationOAuthCallbackState | null {
  if (state === undefined) {
    res.status(400).json({
      message:
        "Missing or invalid OAuth state — refusing to complete this callback. " +
        "Restart the installation from the app's connect button.",
    });
    return null;
  }
  return state;
}
