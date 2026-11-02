import { ErrorWithCode } from "@calcom/platform-libraries/errors";

/**
 * The subset of the ioredis client the API uses. An ioredis `Redis` instance satisfies it, and so does
 * `InMemoryRedis`, which stands in when REDIS_URL is not set.
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string | number): Promise<"OK">;
  set(key: string, value: string | number, mode: "EX", seconds: number): Promise<"OK">;
  set(key: string, value: string | number, mode: "PX", milliseconds: number): Promise<"OK">;
  setex(key: string, seconds: number, value: string | number): Promise<"OK">;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<number>;
  expireat(key: string, unixTimeSeconds: number): Promise<number>;
  hmset(key: string, values: object): Promise<"OK">;
  hgetall(key: string): Promise<Record<string, string>>;
  incr(key: string): Promise<number>;
  lpush(key: string, ...elements: string[]): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  quit(): Promise<"OK">;
}

type StoredValue = string | Map<string, string> | string[];

type Entry = {
  value: StoredValue;
  expiresAt: number | null;
};

const SWEEP_INTERVAL_MS = 60_000;

/**
 * Process-local implementation of `RedisClient`, with Redis semantics for TTLs, lists and hashes.
 * Only correct when the API runs as a single instance: nothing is shared between processes.
 */
export class InMemoryRedis implements RedisClient {
  private readonly store = new Map<string, Entry>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string): Promise<string | null> {
    const entry = this.read(key);
    if (!entry) return null;
    if (typeof entry.value !== "string") throw wrongType(key);
    return entry.value;
  }

  async set(
    key: string,
    value: string | number,
    mode?: "EX" | "PX",
    duration?: number
  ): Promise<"OK"> {
    let expiresAt: number | null = null;
    if (mode && duration !== undefined) {
      expiresAt = this.now() + (mode === "EX" ? duration * 1000 : duration);
    }
    this.write(key, { value: String(value), expiresAt });
    return "OK";
  }

  async setex(key: string, seconds: number, value: string | number): Promise<"OK"> {
    return this.set(key, value, "EX", seconds);
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.read(key)) {
        this.store.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  async keys(pattern: string): Promise<string[]> {
    const matcher = globToRegExp(pattern);
    const matching: string[] = [];
    for (const key of this.store.keys()) {
      if (this.read(key) && matcher.test(key)) matching.push(key);
    }
    return matching;
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.expireAtMs(key, this.now() + seconds * 1000);
  }

  async expireat(key: string, unixTimeSeconds: number): Promise<number> {
    return this.expireAtMs(key, unixTimeSeconds * 1000);
  }

  async hmset(key: string, values: object): Promise<"OK"> {
    const entry = this.read(key);
    if (entry && !(entry.value instanceof Map)) throw wrongType(key);
    const hash = entry?.value instanceof Map ? entry.value : new Map<string, string>();
    for (const [field, value] of Object.entries(values)) {
      hash.set(field, String(value));
    }
    this.write(key, { value: hash, expiresAt: entry?.expiresAt ?? null });
    return "OK";
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const entry = this.read(key);
    if (!entry) return {};
    if (!(entry.value instanceof Map)) throw wrongType(key);
    return Object.fromEntries(entry.value);
  }

  async incr(key: string): Promise<number> {
    const entry = this.read(key);
    if (entry && typeof entry.value !== "string") throw wrongType(key);
    const current = entry ? Number(entry.value) : 0;
    if (!Number.isSafeInteger(current)) {
      throw ErrorWithCode.Factory.InternalServerError(
        `Cannot increment key "${key}": its value is not an integer`
      );
    }
    const next = current + 1;
    // INCR keeps the key's existing TTL.
    this.write(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
    return next;
  }

  async lpush(key: string, ...elements: string[]): Promise<number> {
    const entry = this.read(key);
    if (entry && !Array.isArray(entry.value)) throw wrongType(key);
    const list = Array.isArray(entry?.value) ? entry.value : [];
    // LPUSH a b c leaves the list as [c, b, a].
    for (const element of elements) list.unshift(element);
    this.write(key, { value: list, expiresAt: entry?.expiresAt ?? null });
    return list.length;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const entry = this.read(key);
    if (!entry) return [];
    if (!Array.isArray(entry.value)) throw wrongType(key);
    const list = entry.value;
    const from = start < 0 ? Math.max(list.length + start, 0) : start;
    const to = stop < 0 ? list.length + stop : Math.min(stop, list.length - 1);
    if (from > to) return [];
    return list.slice(from, to + 1);
  }

  async quit(): Promise<"OK"> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.store.clear();
    return "OK";
  }

  private read(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  private write(key: string, entry: Entry): void {
    this.store.set(key, entry);
    this.ensureSweep();
  }

  private expireAtMs(key: string, expiresAt: number): number {
    const entry = this.read(key);
    if (!entry) return 0;
    if (expiresAt <= this.now()) {
      this.store.delete(key);
      return 1;
    }
    entry.expiresAt = expiresAt;
    return 1;
  }

  // Expired keys are otherwise only dropped when read; the sweep bounds memory for keys never read again.
  private ensureSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      for (const key of this.store.keys()) this.read(key);
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }
}

function wrongType(key: string): ErrorWithCode {
  return ErrorWithCode.Factory.InternalServerError(
    `WRONGTYPE Operation against key "${key}" holding the wrong kind of value`
  );
}

function globToRegExp(pattern: string): RegExp {
  let source = "";
  for (const char of pattern) {
    if (char === "*") source += ".*";
    else if (char === "?") source += ".";
    else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}
