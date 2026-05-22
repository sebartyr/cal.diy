import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { decodeOAuthState } from "../decodeOAuthState";

const SECRET = "test-nextauth-secret";

function buildReq({
  state,
  userId,
}: {
  state?: string;
  userId?: number;
}): Parameters<typeof decodeOAuthState>[0] {
  return {
    query: { state },
    session: userId ? { user: { id: userId } } : null,
  } as never;
}

function makeSignedState(payload: Record<string, unknown>, userId: number) {
  const nonce = "nonce-fixed";
  const hash = createHmac("sha256", SECRET).update(`${nonce}:${userId}`).digest("hex");
  return JSON.stringify({ ...payload, nonce, nonceHash: hash });
}

describe("decodeOAuthState (SEC-101)", () => {
  const originalSecret = process.env.NEXTAUTH_SECRET;
  beforeAll(() => {
    process.env.NEXTAUTH_SECRET = SECRET;
  });
  afterAll(() => {
    process.env.NEXTAUTH_SECRET = originalSecret;
  });

  it("rejects an unsigned state for Stripe (no longer on NONCE_EXEMPT)", () => {
    const state = JSON.stringify({ returnTo: "/evil" });
    expect(decodeOAuthState(buildReq({ state, userId: 1 }), "stripe")).toBeUndefined();
  });

  it("accepts a properly-signed state for Stripe", () => {
    const state = makeSignedState({ returnTo: "/ok" }, 1);
    const result = decodeOAuthState(buildReq({ state, userId: 1 }), "stripe");
    expect(result).toBeTruthy();
    expect(result?.returnTo).toBe("/ok");
  });

  it("rejects a state signed for a different user (nonce binding)", () => {
    const state = makeSignedState({ returnTo: "/ok" }, 1);
    expect(decodeOAuthState(buildReq({ state, userId: 999 }), "stripe")).toBeUndefined();
  });

  it("still accepts unsigned state for remaining exempt apps (basecamp3, dub, webex, tandem)", () => {
    const state = JSON.stringify({ returnTo: "/anywhere" });
    for (const app of ["basecamp3", "dub", "webex", "tandem"]) {
      expect(decodeOAuthState(buildReq({ state, userId: 1 }), app)).toBeTruthy();
    }
  });

  it("returns undefined if query.state is missing", () => {
    expect(decodeOAuthState(buildReq({}), "stripe")).toBeUndefined();
  });

  it("returns undefined if nonceHash is tampered with", () => {
    const state = JSON.stringify({
      returnTo: "/ok",
      nonce: "nonce-fixed",
      nonceHash: "deadbeef".padEnd(64, "0"),
    });
    expect(decodeOAuthState(buildReq({ state, userId: 1 }), "stripe")).toBeUndefined();
  });
});
