import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";

// Impersonated sessions are capped in absolute time (not sliding) so a forgotten
// browser tab cannot keep acting as the target user indefinitely.
export const IMPERSONATION_MAX_AGE_SECONDS = 60 * 60;

export const IMPERSONATION_PROVIDER_ID = "impersonation-auth";

type TokenLike = {
  impersonatedBy?: unknown;
  impersonationExpiresAt?: number | null;
};

type SessionLike = { user?: { impersonatedBy?: unknown } | null } | null | undefined;

export function computeImpersonationExpiresAt(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000) + IMPERSONATION_MAX_AGE_SECONDS;
}

export function isImpersonationExpired(token: TokenLike, nowMs: number = Date.now()): boolean {
  if (!token.impersonatedBy) return false;
  // Tokens minted before the expiry was introduced carry no deadline: treat them as expired
  // rather than letting them live for the full session lifetime.
  if (typeof token.impersonationExpiresAt !== "number") return true;
  return token.impersonationExpiresAt * 1000 <= nowMs;
}

export function capMaxAgeForImpersonation(
  token: TokenLike | null | undefined,
  maxAge: number | undefined,
  nowMs: number = Date.now()
): number | undefined {
  if (!token?.impersonatedBy) return maxAge;
  const expiresAt = typeof token.impersonationExpiresAt === "number" ? token.impersonationExpiresAt : 0;
  const remaining = Math.max(0, expiresAt - Math.floor(nowMs / 1000));
  return maxAge === undefined ? remaining : Math.min(maxAge, remaining);
}

export function isImpersonatedSession(session: SessionLike): boolean {
  return !!session?.user?.impersonatedBy;
}

export function assertNotImpersonating(session: SessionLike): void {
  if (isImpersonatedSession(session)) {
    throw new ErrorWithCode(ErrorCode.Forbidden, "This action is not allowed while impersonating a user.");
  }
}
