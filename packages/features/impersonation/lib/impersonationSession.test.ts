import { ErrorWithCode } from "@calcom/lib/errors";
import { describe, expect, it } from "vitest";
import {
  assertNotImpersonating,
  capMaxAgeForImpersonation,
  computeImpersonationExpiresAt,
  IMPERSONATION_MAX_AGE_SECONDS,
  isImpersonatedSession,
  isImpersonationExpired,
} from "./impersonationSession";

const NOW_MS = Date.UTC(2026, 9, 8, 12, 0, 0);
const NOW_S = NOW_MS / 1000;
const impersonatedBy = { id: 1, uuid: "admin-uuid", role: "ADMIN" };

describe("impersonationSession", () => {
  it("computes an absolute deadline one hour from now", () => {
    expect(computeImpersonationExpiresAt(NOW_MS)).toBe(NOW_S + IMPERSONATION_MAX_AGE_SECONDS);
    expect(IMPERSONATION_MAX_AGE_SECONDS).toBe(3600);
  });

  it("never expires regular sessions", () => {
    expect(isImpersonationExpired({}, NOW_MS)).toBe(false);
    expect(capMaxAgeForImpersonation({}, 2592000, NOW_MS)).toBe(2592000);
    expect(capMaxAgeForImpersonation(null, undefined, NOW_MS)).toBeUndefined();
  });

  it("expires impersonated sessions at the deadline", () => {
    expect(isImpersonationExpired({ impersonatedBy, impersonationExpiresAt: NOW_S + 1 }, NOW_MS)).toBe(false);
    expect(isImpersonationExpired({ impersonatedBy, impersonationExpiresAt: NOW_S }, NOW_MS)).toBe(true);
  });

  it("treats impersonated tokens without a deadline as expired", () => {
    expect(isImpersonationExpired({ impersonatedBy }, NOW_MS)).toBe(true);
    expect(capMaxAgeForImpersonation({ impersonatedBy }, 2592000, NOW_MS)).toBe(0);
  });

  it("caps the JWT max age to the remaining impersonation time", () => {
    const token = { impersonatedBy, impersonationExpiresAt: NOW_S + 600 };
    expect(capMaxAgeForImpersonation(token, 2592000, NOW_MS)).toBe(600);
    expect(capMaxAgeForImpersonation(token, 300, NOW_MS)).toBe(300);
    expect(capMaxAgeForImpersonation(token, undefined, NOW_MS)).toBe(600);
    expect(
      capMaxAgeForImpersonation({ impersonatedBy, impersonationExpiresAt: NOW_S - 10 }, 2592000, NOW_MS)
    ).toBe(0);
  });

  it("detects impersonated sessions and blocks them", () => {
    expect(isImpersonatedSession(null)).toBe(false);
    expect(isImpersonatedSession({ user: {} })).toBe(false);
    expect(isImpersonatedSession({ user: { impersonatedBy } })).toBe(true);
    expect(() => assertNotImpersonating({ user: {} })).not.toThrow();
    expect(() => assertNotImpersonating({ user: { impersonatedBy } })).toThrow(ErrorWithCode);
  });
});
