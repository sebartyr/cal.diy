import { describe, expect, it, vi } from "vitest";

import { assertOAuthState } from "../assertOAuthState";

type OAuthState = NonNullable<Parameters<typeof assertOAuthState>[0]>;

function makeRes() {
  const json = vi.fn();
  const status = vi.fn().mockImplementation(() => ({ json }));
  return { status, json } as unknown as Parameters<typeof assertOAuthState>[1] & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

describe("assertOAuthState (SEC-102)", () => {
  it("returns null and responds 400 when state is undefined", () => {
    const res = makeRes();
    const result = assertOAuthState(undefined, res);
    expect(result).toBeNull();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns the state untouched when defined", () => {
    const res = makeRes();
    const state = { returnTo: "/installed/calendar" } as unknown as OAuthState;
    const result = assertOAuthState(state, res);
    expect(result).toBe(state);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("treats an empty-object state as valid (it survived decode)", () => {
    const res = makeRes();
    const state = {} as unknown as OAuthState;
    expect(assertOAuthState(state, res)).toBe(state);
    expect(res.status).not.toHaveBeenCalled();
  });
});
