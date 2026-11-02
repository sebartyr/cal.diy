import { InMemoryRedis } from "@/modules/redis/in-memory-redis";

describe("InMemoryRedis", () => {
  let now: number;
  let redis: InMemoryRedis;

  beforeEach(() => {
    now = 1_000_000;
    redis = new InMemoryRedis(() => now);
  });

  afterEach(async () => {
    await redis.quit();
  });

  describe("strings", () => {
    it("returns null for a missing key and the stored value otherwise", async () => {
      expect(await redis.get("missing")).toBeNull();
      expect(await redis.set("key", 42)).toBe("OK");
      expect(await redis.get("key")).toBe("42");
    });

    it("expires keys set with EX (seconds), PX (milliseconds) and setex", async () => {
      await redis.set("ex", "v", "EX", 10);
      await redis.set("px", "v", "PX", 500);
      await redis.setex("setex", 2, "v");

      now += 499;
      expect(await redis.get("px")).toBe("v");
      now += 1;
      expect(await redis.get("px")).toBeNull();

      now += 1_500;
      expect(await redis.get("setex")).toBeNull();
      expect(await redis.get("ex")).toBe("v");

      now += 8_000;
      expect(await redis.get("ex")).toBeNull();
    });

    it("drops the previous TTL when a key is set again without one", async () => {
      await redis.set("key", "v", "EX", 1);
      await redis.set("key", "w");
      now += 5_000;
      expect(await redis.get("key")).toBe("w");
    });

    it("increments from zero and keeps the existing TTL", async () => {
      expect(await redis.incr("counter")).toBe(1);
      await redis.expire("counter", 10);
      expect(await redis.incr("counter")).toBe(2);
      now += 10_000;
      expect(await redis.get("counter")).toBeNull();
    });

    it("refuses to increment a non-integer value", async () => {
      await redis.set("key", "abc");
      await expect(redis.incr("key")).rejects.toThrow('Cannot increment key "key"');
    });
  });

  describe("keys", () => {
    it("deletes keys and counts only those that existed", async () => {
      await redis.set("a", "1");
      await redis.set("b", "2");
      expect(await redis.del("a", "b", "c")).toBe(2);
      expect(await redis.get("a")).toBeNull();
    });

    it("matches glob patterns and skips expired keys", async () => {
      await redis.set("apiv2:user:1:calendars", "x");
      await redis.set("apiv2:user:2:calendars", "x", "PX", 10);
      await redis.set("apiv2:org:1", "x");
      await redis.set("a.b", "x");
      await redis.set("axb", "x");

      now += 10;
      expect(await redis.keys("apiv2:user:*")).toEqual(["apiv2:user:1:calendars"]);
      expect(await redis.keys("a?b")).toEqual(["a.b", "axb"]);
      expect(await redis.keys("a.b")).toEqual(["a.b"]);
    });

    it("sets expirations with expire and expireat, deleting keys whose time has passed", async () => {
      await redis.set("relative", "v");
      await redis.set("absolute", "v");
      await redis.set("past", "v");

      expect(await redis.expire("relative", 5)).toBe(1);
      expect(await redis.expireat("absolute", now / 1000 + 3)).toBe(1);
      expect(await redis.expireat("past", now / 1000 - 1)).toBe(1);
      expect(await redis.expire("missing", 5)).toBe(0);

      expect(await redis.get("past")).toBeNull();
      now += 3_000;
      expect(await redis.get("absolute")).toBeNull();
      expect(await redis.get("relative")).toBe("v");
      now += 2_000;
      expect(await redis.get("relative")).toBeNull();
    });
  });

  describe("hashes", () => {
    it("merges fields, stringifies values and expires with the key", async () => {
      expect(await redis.hgetall("token")).toEqual({});

      await redis.hmset("token", { ownerId: 7, expiresAt: "2026-01-01T00:00:00.000Z" });
      await redis.hmset("token", { expiresAt: "2027-01-01T00:00:00.000Z" });
      expect(await redis.hgetall("token")).toEqual({ ownerId: "7", expiresAt: "2027-01-01T00:00:00.000Z" });

      await redis.expireat("token", now / 1000 + 1);
      now += 1_000;
      expect(await redis.hgetall("token")).toEqual({});
    });
  });

  describe("lists", () => {
    it("pushes to the head like LPUSH and reads ranges like LRANGE", async () => {
      expect(await redis.lpush("list", "a", "b")).toBe(2);
      expect(await redis.lpush("list", "c")).toBe(3);

      expect(await redis.lrange("list", 0, -1)).toEqual(["c", "b", "a"]);
      expect(await redis.lrange("list", 1, 1)).toEqual(["b"]);
      expect(await redis.lrange("list", -2, 10)).toEqual(["b", "a"]);
      expect(await redis.lrange("list", 2, 1)).toEqual([]);
      expect(await redis.lrange("missing", 0, -1)).toEqual([]);
    });
  });

  it("rejects operations on a key holding another type", async () => {
    await redis.lpush("list", "a");
    await redis.hmset("hash", { a: 1 });

    await expect(redis.get("list")).rejects.toThrow("WRONGTYPE");
    await expect(redis.hgetall("list")).rejects.toThrow("WRONGTYPE");
    await expect(redis.lrange("hash", 0, -1)).rejects.toThrow("WRONGTYPE");
    await expect(redis.lpush("hash", "b")).rejects.toThrow("WRONGTYPE");
  });

  it("clears everything on quit", async () => {
    await redis.set("key", "v");
    await redis.quit();
    expect(await redis.get("key")).toBeNull();
  });
});
