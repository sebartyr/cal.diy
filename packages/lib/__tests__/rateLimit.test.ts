import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetInMemoryRateLimitStore, rateLimiter } from "../rateLimit";

describe("rateLimiter", () => {
  beforeEach(() => {
    __resetInMemoryRateLimitStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when NODE_ENV=production and UNKEY_ROOT_KEY is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UNKEY_ROOT_KEY", "");
    expect(() => rateLimiter()).toThrow(/UNKEY_ROOT_KEY is required/);
  });

  it("uses the in-memory fallback in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UNKEY_ROOT_KEY", "");

    const limit = rateLimiter();
    const r = await limit({ identifier: "user:1", rateLimitingType: "core" });
    expect(r.success).toBe(true);
    expect(r.limit).toBe(10);
  });

  it("rate-limits after the limit is reached (fallback, namespace='core' = 10/min)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UNKEY_ROOT_KEY", "");

    const limit = rateLimiter();
    // 10 allowed
    for (let i = 0; i < 10; i++) {
      const r = await limit({ identifier: "user:bf", rateLimitingType: "core" });
      expect(r.success).toBe(true);
    }
    // 11th must fail
    const blocked = await limit({ identifier: "user:bf", rateLimitingType: "core" });
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("isolates fallback state per identifier", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UNKEY_ROOT_KEY", "");

    const limit = rateLimiter();
    for (let i = 0; i < 10; i++) {
      await limit({ identifier: "alice", rateLimitingType: "core" });
    }
    // alice is exhausted but bob is fresh
    const bob = await limit({ identifier: "bob", rateLimitingType: "core" });
    expect(bob.success).toBe(true);
  });

  it("isolates fallback state per namespace", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UNKEY_ROOT_KEY", "");

    const limit = rateLimiter();
    for (let i = 0; i < 10; i++) {
      await limit({ identifier: "user:ns", rateLimitingType: "core" });
    }
    // 'core' exhausted at 10, but 'common' has a 200 limit and is untouched
    const r = await limit({ identifier: "user:ns", rateLimitingType: "common" });
    expect(r.success).toBe(true);
  });

  it("returns success when UNKEY_ROOT_KEY is set (does not call fallback)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UNKEY_ROOT_KEY", "fake-key-for-unit-test");

    // Just smoke-test that the factory constructs without throwing.
    // We don't exercise the actual @unkey/ratelimit network call here.
    expect(() => rateLimiter()).not.toThrow();
  });
});
