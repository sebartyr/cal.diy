import type { AppConfig } from "@/config/type";
import { InMemoryRedis } from "@/modules/redis/in-memory-redis";
import { RedisService } from "@/modules/redis/redis.service";
import type { ConfigService } from "@nestjs/config";

const configWithoutRedis = { get: () => "" } as unknown as ConfigService<AppConfig>;

describe("RedisService without REDIS_URL", () => {
  it("serves every instance from one shared in-memory store", async () => {
    const first = new RedisService(configWithoutRedis);
    const second = new RedisService(configWithoutRedis);

    expect(first.connection).toBeNull();
    expect(first.redis).toBeInstanceOf(InMemoryRedis);
    expect(second.redis).toBe(first.redis);

    await first.set("apiv2:user:1:calendars", { calendars: [] }, { ttl: 60_000 });
    expect(await second.get("apiv2:user:1:calendars")).toEqual({ calendars: [] });

    await second.del("apiv2:user:1:calendars");
    expect(await first.get("apiv2:user:1:calendars")).toBeNull();
  });

  it("supports the list and counter helpers callers rely on", async () => {
    const service = new RedisService(configWithoutRedis);

    await service.lpush("no-slots", { eventTypeId: 1 }, { eventTypeId: 2 });
    expect(await service.lrange("no-slots", 0, -1)).toEqual([{ eventTypeId: 2 }, { eventTypeId: 1 }]);
    expect(await service.incr("counter")).toBe(1);
    expect(await service.expire("counter", 10)).toBe(1);
    expect(await service.getKeys("no-*")).toEqual(["no-slots"]);
    expect(await service.delMany(["no-slots", "counter"])).toBe(2);
  });
});
