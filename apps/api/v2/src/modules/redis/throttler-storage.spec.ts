import { InMemoryRedis } from "@/modules/redis/in-memory-redis";
import type { RedisService } from "@/modules/redis/redis.service";
import { getThrottlerStorage } from "@/modules/redis/throttler-storage";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { ThrottlerStorageService } from "@nestjs/throttler";
import { Redis } from "ioredis";

describe("getThrottlerStorage", () => {
  it("keeps the counters in memory, shared between callers, when Redis is not configured", async () => {
    const redis = new InMemoryRedis();
    const redisService = { redis, connection: null } as unknown as RedisService;

    const storage = getThrottlerStorage(redisService);

    expect(storage).toBeInstanceOf(ThrottlerStorageService);
    expect(getThrottlerStorage(redisService)).toBe(storage);
    expect(storage.redis).toBe(redis);

    const first = await storage.increment("tracker", 60_000, 1, 60_000, "default");
    const second = await storage.increment("tracker", 60_000, 1, 60_000, "default");
    expect(first).toMatchObject({ totalHits: 1, isBlocked: false });
    expect(second).toMatchObject({ isBlocked: true, timeToBlockExpire: 60 });

    if (storage instanceof ThrottlerStorageService) storage.onApplicationShutdown();
    await redis.quit();
  });

  it("uses the Redis connection when one is configured", () => {
    const connection = new Redis({ lazyConnect: true });
    const redisService = { redis: connection, connection } as unknown as RedisService;

    const storage = getThrottlerStorage(redisService);

    expect(storage).toBeInstanceOf(ThrottlerStorageRedisService);
    expect(storage.redis).toBe(connection);
    connection.disconnect();
  });
});
