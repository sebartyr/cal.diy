import { type LimitOptions, Ratelimit, type RatelimitResponse } from "@unkey/ratelimit";
import { isIpInBanListString } from "./getIP";
import logger from "./logger";

const log = logger.getSubLogger({ prefix: ["RateLimit"] });

export type { RatelimitResponse };

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

/**
 * Sliding-window rate-limit config used by the dev/test in-memory fallback.
 * Mirrors the limits configured against Unkey in production.
 */
const FALLBACK_LIMITS: Record<RateLimitNamespace, { limit: number; durationMs: number }> = {
  core: { limit: 10, durationMs: 60_000 },
  instantMeeting: { limit: 1, durationMs: 10 * 60_000 },
  common: { limit: 200, durationMs: 60_000 },
  forcedSlowMode: { limit: 1, durationMs: 30_000 },
  api: { limit: API_KEY_RATE_LIMIT, durationMs: 60_000 },
  ai: { limit: 20, durationMs: 24 * 60 * 60_000 },
  sms: { limit: 50, durationMs: 5 * 60_000 },
  smsMonth: { limit: 250, durationMs: 30 * 24 * 60 * 60_000 },
};

const inMemoryStore = new Map<string, number[]>();

/**
 * Test helper — reset the sliding window between tests. Not exposed in the
 * package public surface; importers should call it from `__tests__` only.
 */
export function __resetInMemoryRateLimitStore() {
  inMemoryStore.clear();
}

function fallbackInMemoryLimit(namespace: RateLimitNamespace, identifier: string): RatelimitResponse {
  const cfg = FALLBACK_LIMITS[namespace];
  const key = `${namespace}:${identifier}`;
  const now = Date.now();
  const cutoff = now - cfg.durationMs;
  const timestamps = (inMemoryStore.get(key) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= cfg.limit) {
    inMemoryStore.set(key, timestamps);
    return {
      success: false,
      limit: cfg.limit,
      remaining: 0,
      reset: (timestamps[0] ?? now) + cfg.durationMs,
    };
  }

  timestamps.push(now);
  inMemoryStore.set(key, timestamps);
  return {
    success: true,
    limit: cfg.limit,
    remaining: cfg.limit - timestamps.length,
    reset: now + cfg.durationMs,
  };
}

let warnedMissingUnkey = false;

export function rateLimiter() {
  const { UNKEY_ROOT_KEY, NODE_ENV } = process.env;

  if (!UNKEY_ROOT_KEY) {
    // Fail-closed in production: silently letting every request through is
    // exactly what Unkey is supposed to prevent. The previous fail-open made
    // brute-force on /api/auth/* free in any deployment without Unkey.
    if (NODE_ENV === "production") {
      throw new Error(
        "UNKEY_ROOT_KEY is required when NODE_ENV=production. " +
          "Either provision an Unkey root key, or run the in-memory fallback " +
          "explicitly by leaving NODE_ENV unset (development/test only)."
      );
    }
    if (!warnedMissingUnkey) {
      log.warn(
        "UNKEY_ROOT_KEY is not set — using an in-memory sliding-window fallback. " +
          "This is acceptable for development and single-instance test runs only. " +
          "Production deployments MUST provision Unkey (see SEC-200)."
      );
      warnedMissingUnkey = true;
    }
    return async ({ rateLimitingType = "core", identifier }: RateLimitHelper) => {
      if (isIpInBanListString(identifier)) {
        return fallbackInMemoryLimit("forcedSlowMode", identifier);
      }
      return fallbackInMemoryLimit(rateLimitingType, identifier);
    };
  }
  const timeout = {
    fallback: { success: true, limit: 10, remaining: 999, reset: 0 },
    ms: 5000,
  };

  const onError = (err: Error, identifier: string) => {
    log.error("Unkey rate limiter encountered unknown error", {
      error: err.message,
      stack: err.stack,
      identifier,
      timestamp: new Date().toISOString(),
    });
    return { success: true, limit: 10, remaining: 999, reset: 0 };
  };

  const limiter = {
    core: new Ratelimit({
      rootKey: UNKEY_ROOT_KEY,
      namespace: "core",
      limit: 10,
      duration: "60s",
      timeout,
      onError,
    }),
    instantMeeting: new Ratelimit({
      rootKey: UNKEY_ROOT_KEY,
      namespace: "instantMeeting",
      limit: 1,
      duration: "10m",
      timeout,
      onError,
    }),
    common: new Ratelimit({
      rootKey: UNKEY_ROOT_KEY,
      namespace: "common",
      limit: 200,
      duration: "60s",
      timeout,
      onError,
    }),
    forcedSlowMode: new Ratelimit({
      rootKey: UNKEY_ROOT_KEY,
      namespace: "forcedSlowMode",
      limit: 1,
      duration: "30s",
      timeout,
      onError,
    }),
    api: new Ratelimit({
      rootKey: UNKEY_ROOT_KEY,
      namespace: "api",
      limit: API_KEY_RATE_LIMIT,
      duration: "60s",
      timeout,
      onError,
    }),
    ai: new Ratelimit({
      rootKey: UNKEY_ROOT_KEY,
      namespace: "ai",
      limit: 20,
      duration: "1d",
      timeout,
      onError,
    }),
    sms: new Ratelimit({
      rootKey: UNKEY_ROOT_KEY,
      namespace: "sms",
      limit: 50,
      duration: "5m",
      timeout,
      onError,
    }),
    smsMonth: new Ratelimit({
      rootKey: UNKEY_ROOT_KEY,
      namespace: "smsMonth",
      limit: 250,
      duration: "30d",
      timeout,
      onError,
    }),
  };

  async function rateLimit({ rateLimitingType = "core", identifier, opts }: RateLimitHelper) {
    if (isIpInBanListString(identifier)) {
      return await limiter.forcedSlowMode.limit(identifier, opts);
    }

    return await limiter[rateLimitingType].limit(identifier, opts);
  }

  return rateLimit;
}
