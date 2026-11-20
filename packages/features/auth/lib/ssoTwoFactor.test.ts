import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldAskTwoFactorOnSsoLogin } from "./ssoTwoFactor";

describe("shouldAskTwoFactorOnSsoLogin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const user = { twoFactorEnabled: true, role: "USER" };
  const admin = { twoFactorEnabled: true, role: "ADMIN" };

  it("does not ask for the code by default", () => {
    expect(shouldAskTwoFactorOnSsoLogin(user)).toBe(false);
    expect(shouldAskTwoFactorOnSsoLogin(admin)).toBe(false);
  });

  it("asks users with 2FA enabled when SSO_TWO_FACTOR_ENABLED is true", () => {
    vi.stubEnv("SSO_TWO_FACTOR_ENABLED", "true");
    expect(shouldAskTwoFactorOnSsoLogin(user)).toBe(true);
  });

  it("never asks users without 2FA, even when enabled", () => {
    vi.stubEnv("SSO_TWO_FACTOR_ENABLED", "true");
    vi.stubEnv("REQUIRE_2FA_FOR_ADMIN", "true");
    expect(shouldAskTwoFactorOnSsoLogin({ twoFactorEnabled: false, role: "ADMIN" })).toBe(false);
  });

  it("only accepts the exact value true", () => {
    vi.stubEnv("SSO_TWO_FACTOR_ENABLED", "1");
    expect(shouldAskTwoFactorOnSsoLogin(user)).toBe(false);
  });

  it("still asks admins when 2FA is required for admins", () => {
    vi.stubEnv("REQUIRE_2FA_FOR_ADMIN", "true");
    expect(shouldAskTwoFactorOnSsoLogin(admin)).toBe(true);
    expect(shouldAskTwoFactorOnSsoLogin(user)).toBe(false);
  });
});
