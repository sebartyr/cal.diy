import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSessionActingSystemAdmin } from "./isSessionActingSystemAdmin";

describe("isSessionActingSystemAdmin", () => {
  const findAuthIdentityById = vi.fn();
  const userRepository = { findAuthIdentityById };
  const adminSession = { user: { id: 1, role: "ADMIN" } };

  beforeEach(() => {
    findAuthIdentityById.mockReset();
    findAuthIdentityById.mockResolvedValue({ id: 1, role: "ADMIN", locked: false, twoFactorEnabled: false });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("grants an admin session when the account meets the policy", async () => {
    await expect(isSessionActingSystemAdmin(adminSession, userRepository)).resolves.toBe(true);
  });

  it("refuses an admin without 2FA when REQUIRE_2FA_FOR_ADMIN is on", async () => {
    vi.stubEnv("REQUIRE_2FA_FOR_ADMIN", "true");
    await expect(isSessionActingSystemAdmin(adminSession, userRepository)).resolves.toBe(false);

    findAuthIdentityById.mockResolvedValue({ id: 1, role: "ADMIN", locked: false, twoFactorEnabled: true });
    await expect(isSessionActingSystemAdmin(adminSession, userRepository)).resolves.toBe(true);
  });

  it("refuses impersonated, non-admin and anonymous sessions without querying the account", async () => {
    await expect(
      isSessionActingSystemAdmin(
        { user: { id: 1, role: "ADMIN", impersonatedBy: { id: 9 } } },
        userRepository
      )
    ).resolves.toBe(false);
    await expect(isSessionActingSystemAdmin({ user: { id: 1, role: "USER" } }, userRepository)).resolves.toBe(
      false
    );
    await expect(isSessionActingSystemAdmin(null, userRepository)).resolves.toBe(false);
    expect(findAuthIdentityById).not.toHaveBeenCalled();
  });

  it("refuses a locked or missing account", async () => {
    findAuthIdentityById.mockResolvedValue(null);
    await expect(isSessionActingSystemAdmin(adminSession, userRepository)).resolves.toBe(false);
  });
});
