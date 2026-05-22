import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@calcom/lib/constants", () => ({
  APP_CREDENTIAL_SHARING_ENABLED: false,
  CREDENTIAL_SYNC_SECRET: "",
  CREDENTIAL_SYNC_SECRET_HEADER_NAME: "x-cal-secret",
}));

import refreshOAuthTokens from "../refreshOAuthTokens";

beforeEach(() => {
  vi.useRealTimers();
});

describe("refreshOAuthTokens — SEC-107 in-process coalescing", () => {
  it("coalesces concurrent refreshes for the same (user, app)", async () => {
    const refresh = vi.fn(() => new Promise((resolve) => setTimeout(() => resolve({ ok: 1 }), 20)));
    const [a, b, c] = await Promise.all([
      refreshOAuthTokens(refresh, "google", 7),
      refreshOAuthTokens(refresh, "google", 7),
      refreshOAuthTokens(refresh, "google", 7),
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ ok: 1 });
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("does NOT coalesce different users", async () => {
    const refresh = vi.fn(() => Promise.resolve({ ok: 1 }));
    await Promise.all([
      refreshOAuthTokens(refresh, "google", 1),
      refreshOAuthTokens(refresh, "google", 2),
    ]);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does NOT coalesce different apps for the same user", async () => {
    const refresh = vi.fn(() => Promise.resolve({ ok: 1 }));
    await Promise.all([
      refreshOAuthTokens(refresh, "google", 1),
      refreshOAuthTokens(refresh, "zoom", 1),
    ]);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("releases the lock so a later call after the first completes runs fresh", async () => {
    const refresh = vi.fn(() => Promise.resolve({ ok: 1 }));
    await refreshOAuthTokens(refresh, "google", 1);
    await refreshOAuthTokens(refresh, "google", 1);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("releases the lock on rejection so a retry can run", async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ ok: 1 });
    await expect(refreshOAuthTokens(refresh, "google", 1)).rejects.toThrow("boom");
    const out = await refreshOAuthTokens(refresh, "google", 1);
    expect(out).toEqual({ ok: 1 });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
