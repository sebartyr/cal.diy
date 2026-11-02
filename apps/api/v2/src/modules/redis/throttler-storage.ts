import type { RedisClient } from "@/modules/redis/in-memory-redis";
import type { RedisService } from "@/modules/redis/redis.service";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { type ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";

/** CustomThrottlerGuard reads and writes its per-API-key rate limit cache through `redis`. */
export type ThrottlerStorageWithCache = ThrottlerStorage & {
  redis: Pick<RedisClient, "get" | "set">;
};

class InMemoryThrottlerStorage extends ThrottlerStorageService {
  constructor(readonly redis: RedisClient) {
    super();
  }
}

const storages = new WeakMap<RedisClient, ThrottlerStorageWithCache>();

/**
 * Rate-limit counters live in Redis when it is configured, otherwise in this process's memory.
 * ThrottlerStorageRedisService cannot take the in-memory client: given anything but an ioredis
 * instance it opens its own connection to localhost:6379.
 */
export function getThrottlerStorage(redisService: RedisService): ThrottlerStorageWithCache {
  const existing = storages.get(redisService.redis);
  if (existing) return existing;

  const storage = redisService.connection
    ? new ThrottlerStorageRedisService(redisService.connection)
    : new InMemoryThrottlerStorage(redisService.redis);
  // Keyed by client: RedisService has one instance per module that provides it, and with the
  // in-memory store every caller must share the same counters.
  storages.set(redisService.redis, storage);
  return storage;
}
