import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetInMemoryRateLimitStore, RATE_LIMIT_WINDOWS, rateLimiter } from "../rateLimit";

vi.mock("@calcom/prisma", () => ({ prisma: {} }));

describe("rateLimiter", () => {
  beforeEach(() => {
    __resetInMemoryRateLimitStore();
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('throws when NODE_ENV=production and RATE_LIMIT_STORE="memory"', () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_STORE", "memory");
    expect(() => rateLimiter()).toThrow(/not allowed when NODE_ENV=production/);
  });

  it("uses the in-memory store outside production", async () => {
    const limit = rateLimiter();
    const r = await limit({ identifier: "user:1", rateLimitingType: "core" });
    expect(r.success).toBe(true);
    expect(r.limit).toBe(10);
  });

  it("rate-limits after the limit is reached (namespace='core' = 10/min)", async () => {
    const limit = rateLimiter();
    for (let i = 0; i < 10; i++) {
      const r = await limit({ identifier: "user:bf", rateLimitingType: "core" });
      expect(r.success).toBe(true);
    }
    const blocked = await limit({ identifier: "user:bf", rateLimitingType: "core" });
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("reports a reset time in the future once blocked", async () => {
    const limit = rateLimiter();
    for (let i = 0; i < 10; i++) {
      await limit({ identifier: "user:reset", rateLimitingType: "core" });
    }
    const blocked = await limit({ identifier: "user:reset", rateLimitingType: "core" });
    expect(blocked.reset).toBeGreaterThan(Date.now());
  });

  it("refills tokens as time passes", async () => {
    vi.useFakeTimers();
    const limit = rateLimiter();
    for (let i = 0; i < 10; i++) {
      await limit({ identifier: "user:refill", rateLimitingType: "core" });
    }
    expect((await limit({ identifier: "user:refill", rateLimitingType: "core" })).success).toBe(false);

    // 'core' refills 10 tokens per minute, so 6s buys exactly one token back.
    vi.advanceTimersByTime(6_000);
    expect((await limit({ identifier: "user:refill", rateLimitingType: "core" })).success).toBe(true);
  });

  it("isolates state per identifier", async () => {
    const limit = rateLimiter();
    for (let i = 0; i < 10; i++) {
      await limit({ identifier: "alice", rateLimitingType: "core" });
    }
    const bob = await limit({ identifier: "bob", rateLimitingType: "core" });
    expect(bob.success).toBe(true);
  });

  it("isolates state per namespace", async () => {
    const limit = rateLimiter();
    for (let i = 0; i < 10; i++) {
      await limit({ identifier: "user:ns", rateLimitingType: "core" });
    }
    const r = await limit({ identifier: "user:ns", rateLimitingType: "common" });
    expect(r.success).toBe(true);
  });

  it("consumes the configured cost per request", async () => {
    const limit = rateLimiter();
    const r = await limit({ identifier: "user:cost", rateLimitingType: "core", opts: { cost: 4 } });
    expect(r.success).toBe(true);
    expect(r.remaining).toBe(6);
  });

  it("fails open when the store throws, rather than taking the request down", async () => {
    vi.stubEnv("NODE_ENV", "production");
    // The Postgres-backed store is selected in production, and the mocked
    // prisma client has no $queryRaw, so the call throws.
    const limit = rateLimiter();
    const r = await limit({ identifier: "user:err", rateLimitingType: "core" });
    expect(r.success).toBe(true);
  });

  it("keeps every namespace configured", () => {
    for (const window of Object.values(RATE_LIMIT_WINDOWS)) {
      expect(window.limit).toBeGreaterThan(0);
      expect(window.durationMs).toBeGreaterThan(0);
    }
  });
});
