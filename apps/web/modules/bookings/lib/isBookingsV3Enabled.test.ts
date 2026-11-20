import { describe, expect, it, vi } from "vitest";
import { isBookingsV3Enabled } from "./isBookingsV3Enabled";

const repo = (globallyEnabled: boolean, enabledForUser: boolean) => ({
  checkIfFeatureIsEnabledGlobally: vi.fn().mockResolvedValue(globallyEnabled),
  checkIfUserHasFeature: vi.fn().mockResolvedValue(enabledForUser),
});

describe("isBookingsV3Enabled", () => {
  it("is enabled for everyone when the flag is on globally", async () => {
    const featuresRepository = repo(true, false);
    await expect(isBookingsV3Enabled(featuresRepository, 7)).resolves.toBe(true);
    expect(featuresRepository.checkIfFeatureIsEnabledGlobally).toHaveBeenCalledWith("bookings-v3");
  });

  it("is enabled for a user or team that has it assigned", async () => {
    const featuresRepository = repo(false, true);
    await expect(isBookingsV3Enabled(featuresRepository, 7)).resolves.toBe(true);
    expect(featuresRepository.checkIfUserHasFeature).toHaveBeenCalledWith(7, "bookings-v3");
  });

  it("is disabled when neither is set", async () => {
    await expect(isBookingsV3Enabled(repo(false, false), 7)).resolves.toBe(false);
  });
});
