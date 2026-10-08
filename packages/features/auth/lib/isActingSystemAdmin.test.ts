import { afterEach, describe, expect, it, vi } from "vitest";
import { isActingSystemAdmin } from "./isActingSystemAdmin";
import { getSystemAdminDenialReason } from "./systemAdminPolicy";

describe("getSystemAdminDenialReason", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts an unlocked admin", () => {
    expect(getSystemAdminDenialReason({ role: "ADMIN", twoFactorEnabled: false, locked: false })).toBeNull();
  });

  it("refuses non-admin roles and locked accounts", () => {
    expect(getSystemAdminDenialReason({ role: "USER", twoFactorEnabled: true })).toBe("not_admin");
    expect(getSystemAdminDenialReason({ role: "INACTIVE_ADMIN", twoFactorEnabled: true })).toBe("not_admin");
    expect(getSystemAdminDenialReason({ role: "ADMIN", twoFactorEnabled: true, locked: true })).toBe(
      "locked"
    );
  });

  it("requires 2FA only when REQUIRE_2FA_FOR_ADMIN is on", () => {
    vi.stubEnv("REQUIRE_2FA_FOR_ADMIN", "true");
    expect(getSystemAdminDenialReason({ role: "ADMIN", twoFactorEnabled: false })).toBe(
      "two_factor_required"
    );
    expect(getSystemAdminDenialReason({ role: "ADMIN", twoFactorEnabled: undefined })).toBe(
      "two_factor_required"
    );
    expect(getSystemAdminDenialReason({ role: "ADMIN", twoFactorEnabled: true })).toBeNull();
  });
});

describe("isActingSystemAdmin", () => {
  const session = { user: {} };
  const admin = { role: "ADMIN", twoFactorEnabled: true };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("grants an admin with a regular session", () => {
    expect(isActingSystemAdmin({ user: admin, session })).toBe(true);
  });

  it("refuses non-admin roles", () => {
    expect(isActingSystemAdmin({ user: { role: "USER", twoFactorEnabled: true }, session })).toBe(false);
    expect(isActingSystemAdmin({ user: { role: "INACTIVE_ADMIN", twoFactorEnabled: true }, session })).toBe(
      false
    );
    expect(isActingSystemAdmin({ user: { role: undefined, twoFactorEnabled: true }, session })).toBe(false);
  });

  it("refuses an admin without 2FA when REQUIRE_2FA_FOR_ADMIN is on, like the admin routes", () => {
    vi.stubEnv("REQUIRE_2FA_FOR_ADMIN", "true");
    expect(isActingSystemAdmin({ user: { role: "ADMIN", twoFactorEnabled: false }, session })).toBe(false);
    expect(isActingSystemAdmin({ user: admin, session })).toBe(true);
  });

  it("refuses an admin acting through an impersonated session", () => {
    expect(isActingSystemAdmin({ user: admin, session: { user: { impersonatedBy: { id: 7 } } } })).toBe(
      false
    );
  });

  it("refuses when no session is available to rule impersonation out", () => {
    expect(isActingSystemAdmin({ user: admin, session: undefined })).toBe(false);
    expect(isActingSystemAdmin({ user: admin, session: null })).toBe(false);
  });
});
