import { describe, expect, it, vi } from "vitest";

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

import { featureFlagRouter } from "./_router";

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
