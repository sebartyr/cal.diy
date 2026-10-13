import { prisma } from "@calcom/prisma";

/**
 * Shape kept wire-compatible with the `RatelimitResponse` previously returned by
 * `@unkey/ratelimit`, so that callers and `onRateLimiterResponse` consumers
 * (which build `X-RateLimit-*` headers from it) need no changes.
 */
export type RatelimitResponse = {
  success: boolean;
  limit: number;
  remaining: number;
  /** Epoch milliseconds at which the caller may retry. */
  reset: number;
};

export type LimitOptions = {
  /** Number of tokens this request consumes. Defaults to 1. */
  cost?: number;
};

export type RateLimitWindow = {
  limit: number;
  durationMs: number;
};

export interface RateLimitStore {
  limit(key: string, window: RateLimitWindow, opts?: LimitOptions): Promise<RatelimitResponse>;
}

function buildResponse(
  tokens: number,
  allowed: boolean,
  window: RateLimitWindow,
  cost: number
): RatelimitResponse {
  const refillPerMs = window.limit / window.durationMs;
  // When blocked, the caller may retry once the bucket has refilled enough
  // tokens to cover the request that was just rejected.
  const msUntilRetry = allowed ? 0 : Math.ceil((cost - tokens) / refillPerMs);

  return {
    success: allowed,
    limit: window.limit,
    remaining: Math.max(0, Math.floor(tokens)),
    reset: Date.now() + Math.max(0, msUntilRetry),
  };
}

/**
 * Process-local token bucket. Correct only for a single instance, so it backs
 * development and tests; production uses {@link PostgresRateLimitStore}.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, { tokens: number; updatedAt: number }>();

  reset() {
    this.buckets.clear();
  }

  async limit(key: string, window: RateLimitWindow, opts?: LimitOptions): Promise<RatelimitResponse> {
    const cost = opts?.cost ?? 1;
    const now = Date.now();
    const refillPerMs = window.limit / window.durationMs;
    const bucket = this.buckets.get(key);

    const refilled = bucket
      ? Math.min(window.limit, bucket.tokens + (now - bucket.updatedAt) * refillPerMs)
      : window.limit;

    const allowed = refilled >= cost;
    const tokens = allowed ? refilled - cost : refilled;
    this.buckets.set(key, { tokens, updatedAt: now });

    return buildResponse(tokens, allowed, window, cost);
  }
}

type BucketRow = { tokens: number; allowed: boolean };

/**
 * Token bucket backed by the `RateLimitBucket` table, shared by every app instance.
 *
 * Admission is decided by the `WHERE` clause of a single `UPDATE`, so the row
 * lock covers both the check and the debit. Reading the bucket and writing it
 * back as two statements would let concurrent requests observe the same state
 * and both be admitted, which is precisely the race a rate limiter must not
 * lose.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  async limit(key: string, window: RateLimitWindow, opts?: LimitOptions): Promise<RatelimitResponse> {
    const cost = opts?.cost ?? 1;
    const refillPerSecond = (window.limit / window.durationMs) * 1000;
    const durationSeconds = window.durationMs / 1000;

    let row = await this.consume(key, window.limit, refillPerSecond, durationSeconds, cost);

    // No row at all (first ever request for this key), as opposed to a row that
    // exists but is out of tokens.
    if (!row) {
      await this.createBucket(key, window.limit, durationSeconds);
      row = await this.consume(key, window.limit, refillPerSecond, durationSeconds, cost);
    }

    if (!row) {
      throw new Error(`Rate limit bucket for "${key}" could not be created or updated`);
    }

    return buildResponse(row.tokens, row.allowed, window, cost);
  }

  /**
   * An expired bucket needs no special handling: a large elapsed time refills it
   * past `limit` and the `LEAST` clamp lands on a full bucket, which is what a
   * missing row would have produced anyway. That is why the cleanup cron can
   * delete rows freely.
   *
   * The `debited` CTE performs the write; `untouched` reports the pre-statement
   * state used when the request is rejected. CTEs observe the same snapshot, so
   * `untouched` is unaffected by the `UPDATE`.
   */
  private async consume(
    key: string,
    limit: number,
    refillPerSecond: number,
    durationSeconds: number,
    cost: number
  ) {
    const rows = await prisma.$queryRaw<BucketRow[]>`
      WITH debited AS (
        UPDATE "RateLimitBucket" SET
          "tokens" = LEAST(
            ${limit}::float8,
            "tokens" + EXTRACT(EPOCH FROM (now() - "updatedAt")) * ${refillPerSecond}::float8
          ) - ${cost}::float8,
          "updatedAt" = now(),
          "expiresAt" = now() + make_interval(secs => ${durationSeconds}::float8)
        WHERE "key" = ${key}
          AND LEAST(
            ${limit}::float8,
            "tokens" + EXTRACT(EPOCH FROM (now() - "updatedAt")) * ${refillPerSecond}::float8
          ) >= ${cost}::float8
        RETURNING "tokens", true AS "allowed"
      ),
      untouched AS (
        SELECT
          LEAST(
            ${limit}::float8,
            "tokens" + EXTRACT(EPOCH FROM (now() - "updatedAt")) * ${refillPerSecond}::float8
          ) AS "tokens",
          false AS "allowed"
        FROM "RateLimitBucket"
        WHERE "key" = ${key}
      )
      SELECT "tokens", "allowed" FROM debited
      UNION ALL
      SELECT "tokens", "allowed" FROM untouched WHERE NOT EXISTS (SELECT 1 FROM debited)
    `;

    return rows[0] ?? null;
  }

  private async createBucket(key: string, limit: number, durationSeconds: number) {
    await prisma.$executeRaw`
      INSERT INTO "RateLimitBucket" ("key", "tokens", "updatedAt", "expiresAt")
      VALUES (
        ${key},
        ${limit}::float8,
        now(),
        now() + make_interval(secs => ${durationSeconds}::float8)
      )
      ON CONFLICT ("key") DO NOTHING
    `;
  }

  /** Bounds table size; buckets are self-healing, so deleting them is safe. */
  static async deleteExpired(): Promise<number> {
    return prisma.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "expiresAt" < now()`;
  }
}
