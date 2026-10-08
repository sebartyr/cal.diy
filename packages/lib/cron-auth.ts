import { createHash, timingSafeEqual } from "node:crypto";
import process from "node:process";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Constant-time comparison that fails closed: an empty or undefined expected
 * secret never matches, so an unset env var cannot be satisfied by sending
 * "undefined" or an empty string. Both sides are hashed first so that
 * timingSafeEqual gets equal-length buffers and the length is not leaked.
 */
export function safeCompareSecret(
  provided: string | null | undefined,
  expected: string | undefined
): boolean {
  if (!expected || !provided) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}

/**
 * Accepts either the raw CRON_API_KEY or "Bearer <CRON_SECRET>", which is the
 * contract the cron routes already expose to external schedulers.
 */
export function isAuthorizedCronRequest(provided: string | null | undefined): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const bearerMatches = !!cronSecret && safeCompareSecret(provided, `Bearer ${cronSecret}`);
  const apiKeyMatches = safeCompareSecret(provided, process.env.CRON_API_KEY);
  return bearerMatches || apiKeyMatches;
}

export function isAuthorizedCronBearer(authorizationHeader: string | null | undefined): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return safeCompareSecret(authorizationHeader, `Bearer ${cronSecret}`);
}

/**
 * For routes that only ever accepted the raw CRON_API_KEY (from the
 * Authorization header or the `apiKey` query param), not Bearer CRON_SECRET.
 */
export function isAuthorizedCronApiKey(provided: string | null | undefined): boolean {
  return safeCompareSecret(provided, process.env.CRON_API_KEY);
}
