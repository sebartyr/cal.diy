import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkIfTeamHasFeature, hasMembership } = vi.hoisted(() => ({
  checkIfTeamHasFeature: vi.fn(),
  hasMembership: vi.fn(),
}));

vi.mock("@calcom/features/di/containers/FeaturesRepository", () => ({
  getFeaturesRepository: () => ({ checkIfTeamHasFeature, getAllFeatures: vi.fn() }),
}));

vi.mock("@calcom/features/membership/repositories/MembershipRepository", () => ({
  MembershipRepository: class {
    hasMembership = hasMembership;
  },
}));

import { canSeeTeamSettings, featureFlagRouter } from "./_router";

describe("featureFlagRouter", () => {
  it("refuses anonymous callers on checkTeamFeature and list", async () => {
    const anonymous = featureFlagRouter.createCaller({} as never);

    await expect(anonymous.checkTeamFeature({ teamId: 42, feature: "x" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(anonymous.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(checkIfTeamHasFeature).not.toHaveBeenCalled();
  });
});

describe("canSeeTeamSettings", () => {
  const teamFindUnique = vi.fn();
  const ctx = (user: Record<string, unknown>) =>
    ({
      user: {
        id: 7,
        role: "USER",
        twoFactorEnabled: true,
        organization: { isOrgAdmin: false },
        profile: null,
        ...user,
      },
      prisma: { team: { findUnique: teamFindUnique } },
    }) as never;

  beforeEach(() => {
    hasMembership.mockReset();
    hasMembership.mockResolvedValue(false);
    teamFindUnique.mockReset();
  });

  it("accepts a member of the team", async () => {
    hasMembership.mockResolvedValue(true);
    await expect(canSeeTeamSettings(ctx({}), 42)).resolves.toBe(true);
  });

  it("accepts a system admin meeting the admin policy", async () => {
    await expect(canSeeTeamSettings(ctx({ role: "ADMIN" }), 42)).resolves.toBe(true);
  });

  it("accepts an admin of the platform organization owning the team", async () => {
    teamFindUnique.mockResolvedValue({ parentId: 9, parent: { isPlatform: true } });
    const orgAdmin = ctx({ organization: { isOrgAdmin: true }, profile: { organizationId: 9 } });
    await expect(canSeeTeamSettings(orgAdmin, 42)).resolves.toBe(true);
  });

  it("refuses an org admin when the organization is not a platform one", async () => {
    teamFindUnique.mockResolvedValue({ parentId: 9, parent: { isPlatform: false } });
    const orgAdmin = ctx({ organization: { isOrgAdmin: true }, profile: { organizationId: 9 } });
    await expect(canSeeTeamSettings(orgAdmin, 42)).resolves.toBe(false);
  });

  it("refuses an org admin of another organization", async () => {
    teamFindUnique.mockResolvedValue({ parentId: 3, parent: { isPlatform: true } });
    const orgAdmin = ctx({ organization: { isOrgAdmin: true }, profile: { organizationId: 9 } });
    await expect(canSeeTeamSettings(orgAdmin, 42)).resolves.toBe(false);
  });

  it("refuses an outsider", async () => {
    await expect(canSeeTeamSettings(ctx({}), 42)).resolves.toBe(false);
    expect(teamFindUnique).not.toHaveBeenCalled();
  });
});
