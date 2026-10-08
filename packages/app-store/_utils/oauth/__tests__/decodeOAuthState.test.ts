import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
  beforeAll(() => {
    vi.stubEnv("NEXTAUTH_SECRET", SECRET);
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("rejects an unsigned state", () => {
    const state = JSON.stringify({ returnTo: "/evil" });
    expect(decodeOAuthState(buildReq({ state, userId: 1 }))).toBeUndefined();
  });

  it("accepts a properly-signed state", () => {
    const state = makeSignedState({ returnTo: "/ok" }, 1);
    const result = decodeOAuthState(buildReq({ state, userId: 1 }));
    expect(result).toBeTruthy();
    expect(result?.returnTo).toBe("/ok");
  });

  it("rejects a state signed for a different user (nonce binding)", () => {
    const state = makeSignedState({ returnTo: "/ok" }, 1);
    expect(decodeOAuthState(buildReq({ state, userId: 999 }))).toBeUndefined();
  });

  it("rejects an unsigned state carrying a teamId (no app is exempt from the nonce)", () => {
    const state = JSON.stringify({ teamId: 7 });
    expect(decodeOAuthState(buildReq({ state, userId: 1 }))).toBeUndefined();
  });

  it("returns undefined if query.state is missing", () => {
    expect(decodeOAuthState(buildReq({}))).toBeUndefined();
  });

  it("returns undefined if nonceHash is tampered with", () => {
    const state = JSON.stringify({
      returnTo: "/ok",
      nonce: "nonce-fixed",
      nonceHash: "deadbeef".padEnd(64, "0"),
    });
    expect(decodeOAuthState(buildReq({ state, userId: 1 }))).toBeUndefined();
  });
});
