import { MembershipRole, UserPermissionRole } from "@calcom/prisma/enums";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const membershipFindUnique = vi.fn();

vi.mock("@calcom/prisma", () => ({
  prisma: { membership: { findUnique: (args: unknown) => membershipFindUnique(args) } },
}));

import { requireMember } from "../permissions";

const admin = (overrides: { twoFactorEnabled?: boolean; locked?: boolean } = {}) => ({
  role: UserPermissionRole.ADMIN,
  twoFactorEnabled: true,
  locked: false,
  ...overrides,
});

describe("requireMember - system admin bypass follows the admin policy", () => {
  beforeEach(() => {
    membershipFindUnique.mockReset();
    membershipFindUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lets an admin who meets the policy act on a team they are not a member of", async () => {
    vi.stubEnv("REQUIRE_2FA_FOR_ADMIN", "true");

    await expect(requireMember(7, 42, MembershipRole.OWNER, admin())).resolves.toMatchObject({
      isSyntheticAdmin: true,
      role: MembershipRole.OWNER,
    });
  });

  it("refuses an admin without 2FA when REQUIRE_2FA_FOR_ADMIN is on", async () => {
    vi.stubEnv("REQUIRE_2FA_FOR_ADMIN", "true");

    await expect(
      requireMember(7, 42, MembershipRole.OWNER, admin({ twoFactorEnabled: false }))
    ).rejects.toThrow("Not a member of this team");
  });

  it("keeps an admin without 2FA when the policy is off", async () => {
    vi.stubEnv("REQUIRE_2FA_FOR_ADMIN", "false");

    await expect(
      requireMember(7, 42, MembershipRole.OWNER, admin({ twoFactorEnabled: false }))
    ).resolves.toMatchObject({ isSyntheticAdmin: true });
  });

  it("refuses a locked admin", async () => {
    await expect(requireMember(7, 42, MembershipRole.OWNER, admin({ locked: true }))).rejects.toThrow(
      "Not a member of this team"
    );
  });
});
