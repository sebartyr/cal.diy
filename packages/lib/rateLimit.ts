import process from "node:process";
import { isIpInBanListString } from "./getIP";
import logger from "./logger";
import type { LimitOptions, RateLimitStore, RateLimitWindow, RatelimitResponse } from "./rateLimitStore";
import { InMemoryRateLimitStore, PostgresRateLimitStore } from "./rateLimitStore";

const log = logger.getSubLogger({ prefix: ["RateLimit"] });

export type { RatelimitResponse, LimitOptions };

export type RateLimitNamespace =
  | "core"
  | "forcedSlowMode"
  | "common"
  | "api"
  | "ai"
  | "sms"
  | "smsMonth"
  | "instantMeeting";

export type RateLimitHelper = {
  rateLimitingType?: RateLimitNamespace;
  identifier: string;
  opts?: LimitOptions;
  /**
   * Using a callback instead of a regular return to provide headers even
   * when the rate limit is reached and an error is thrown.
   **/
  onRateLimiterResponse?: (response: RatelimitResponse) => void;
};

export const API_KEY_RATE_LIMIT = 30;

export const RATE_LIMIT_WINDOWS: Record<RateLimitNamespace, RateLimitWindow> = {
  core: { limit: 10, durationMs: 60_000 },
  instantMeeting: { limit: 1, durationMs: 10 * 60_000 },
  common: { limit: 200, durationMs: 60_000 },
  forcedSlowMode: { limit: 1, durationMs: 30_000 },
  api: { limit: API_KEY_RATE_LIMIT, durationMs: 60_000 },
  ai: { limit: 20, durationMs: 24 * 60 * 60_000 },
  sms: { limit: 50, durationMs: 5 * 60_000 },
  smsMonth: { limit: 250, durationMs: 30 * 24 * 60 * 60_000 },
};

const inMemoryStore = new InMemoryRateLimitStore();
const postgresStore = new PostgresRateLimitStore();

/**
 * Test helper — reset the in-memory buckets between tests. Not exposed in the
 * package public surface; importers should call it from `__tests__` only.
 */
export function __resetInMemoryRateLimitStore() {
  inMemoryStore.reset();
}

let warnedInMemoryStore = false;

function resolveStore(): RateLimitStore {
  const { RATE_LIMIT_STORE, NODE_ENV } = process.env;

  if (RATE_LIMIT_STORE === "postgres") return postgresStore;

  if (RATE_LIMIT_STORE === "memory") {
    // Fail-closed in production: a per-instance limiter silently multiplies
    // every limit by the number of running instances, which makes brute-force
    // on /api/auth/* practical again (SEC-200).
    if (NODE_ENV === "production") {
      throw new Error(
        'RATE_LIMIT_STORE="memory" is not allowed when NODE_ENV=production, because the ' +
          "in-memory limiter is per-instance and therefore unenforceable across a scaled " +
          "deployment. Remove the variable to use the Postgres-backed limiter."
      );
    }
    if (!warnedInMemoryStore) {
      log.warn(
        'RATE_LIMIT_STORE="memory" — using a process-local token bucket. This is ' +
          "acceptable for development and single-instance test runs only."
      );
      warnedInMemoryStore = true;
    }
    return inMemoryStore;
  }

  return NODE_ENV === "production" ? postgresStore : inMemoryStore;
}

export function rateLimiter() {
  const store = resolveStore();

  return async function rateLimit({
    rateLimitingType = "core",
    identifier,
    opts,
  }: RateLimitHelper): Promise<RatelimitResponse> {
    const namespace: RateLimitNamespace = isIpInBanListString(identifier)
      ? "forcedSlowMode"
      : rateLimitingType;

    try {
      return await store.limit(`${namespace}:${identifier}`, RATE_LIMIT_WINDOWS[namespace], opts);
    } catch (err) {
      // A limiter outage must not take the whole app down with it; this mirrors
      // the `onError` fallback the Unkey client used to provide.
      log.error("Rate limiter encountered an unexpected error", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        identifier,
        namespace,
        timestamp: new Date().toISOString(),
      });
      const { limit } = RATE_LIMIT_WINDOWS[namespace];
      return { success: true, limit, remaining: limit, reset: Date.now() };
    }
  };
}
