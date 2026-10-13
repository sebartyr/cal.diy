import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryRateLimitStore, PostgresRateLimitStore } from "../rateLimitStore";

const queryRaw = vi.fn();
const executeRaw = vi.fn();

vi.mock("@calcom/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    $executeRaw: (...args: unknown[]) => executeRaw(...args),
  },
}));

const WINDOW = { limit: 10, durationMs: 60_000 };

describe("InMemoryRateLimitStore", () => {
  let store: InMemoryRateLimitStore;

  beforeEach(() => {
    store = new InMemoryRateLimitStore();
  });

  it("admits the first request with a full bucket minus the cost", async () => {
    const r = await store.limit("core:a", WINDOW);
    expect(r).toMatchObject({ success: true, limit: 10, remaining: 9 });
  });

  it("rejects once the bucket is empty", async () => {
    for (let i = 0; i < 10; i++) await store.limit("core:b", WINDOW);
    const r = await store.limit("core:b", WINDOW);
    expect(r.success).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("rejects a request whose cost exceeds the remaining tokens without debiting", async () => {
    await store.limit("core:c", WINDOW, { cost: 8 });
    const rejected = await store.limit("core:c", WINDOW, { cost: 5 });
    expect(rejected.success).toBe(false);
    // The 2 remaining tokens are untouched by the rejected request.
    expect(rejected.remaining).toBe(2);
    expect((await store.limit("core:c", WINDOW, { cost: 2 })).success).toBe(true);
  });

  it("reports a retry delay covering the rejected request's cost", async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 10; i++) await store.limit("core:d", WINDOW);
    const r = await store.limit("core:d", WINDOW);
    // 10 tokens per 60s means one token every 6s.
    expect(r.reset - Date.now()).toBe(6_000);
    vi.useRealTimers();
  });

  it("keeps buckets separate per key", async () => {
    for (let i = 0; i < 10; i++) await store.limit("core:e", WINDOW);
    expect((await store.limit("core:f", WINDOW)).success).toBe(true);
  });

  it("forgets everything on reset", async () => {
    for (let i = 0; i < 10; i++) await store.limit("core:g", WINDOW);
    store.reset();
    expect((await store.limit("core:g", WINDOW)).success).toBe(true);
  });
});

describe("PostgresRateLimitStore", () => {
  let store: PostgresRateLimitStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new PostgresRateLimitStore();
  });

  it("returns the admitted bucket from a single statement", async () => {
    queryRaw.mockResolvedValueOnce([{ tokens: 9, allowed: true }]);

    const r = await store.limit("core:a", WINDOW);

    expect(r).toMatchObject({ success: true, limit: 10, remaining: 9 });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("reports rejection when the bucket is out of tokens", async () => {
    queryRaw.mockResolvedValueOnce([{ tokens: 0, allowed: false }]);

    const r = await store.limit("core:b", WINDOW);

    expect(r.success).toBe(false);
    expect(r.reset).toBeGreaterThan(Date.now());
  });

  it("creates the bucket then retries when the key is seen for the first time", async () => {
    queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ tokens: 9, allowed: true }]);

    const r = await store.limit("core:c", WINDOW);

    expect(r.success).toBe(true);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it("throws when the bucket can neither be created nor updated", async () => {
    queryRaw.mockResolvedValue([]);

    await expect(store.limit("core:d", WINDOW)).rejects.toThrow(/could not be created or updated/);
  });

  it("deletes expired buckets", async () => {
    executeRaw.mockResolvedValueOnce(7);
    await expect(PostgresRateLimitStore.deleteExpired()).resolves.toBe(7);
  });
});
