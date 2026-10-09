import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@calcom/prisma", () => ({
  prisma: { credential: { findFirst } },
  default: { credential: { findFirst } },
}));

import { CredentialRepository } from "./CredentialRepository";

describe("CredentialRepository.findPaymentCredentialByAppIdAndUserIdOrTeamId", () => {
  beforeEach(() => {
    findFirst.mockReset();
    findFirst.mockResolvedValue(null);
  });

  it("selects the credential key and only the app fields needed to load the payment service", async () => {
    await CredentialRepository.findPaymentCredentialByAppIdAndUserIdOrTeamId({
      appId: "stripe",
      userId: 1,
    });

    const args = findFirst.mock.calls[0][0];
    expect(args).not.toHaveProperty("include");
    expect(args.select).toEqual({
      id: true,
      type: true,
      key: true,
      appId: true,
      userId: true,
      teamId: true,
      app: { select: { slug: true, dirName: true } },
    });
  });

  it("searches by userId when there is no teamId", async () => {
    await CredentialRepository.findPaymentCredentialByAppIdAndUserIdOrTeamId({
      appId: "stripe",
      userId: 1,
      teamId: null,
    });

    expect(findFirst.mock.calls[0][0].where).toEqual({ userId: 1, appId: "stripe" });
  });

  it("searches by teamId when a teamId is given", async () => {
    await CredentialRepository.findPaymentCredentialByAppIdAndUserIdOrTeamId({
      appId: "stripe",
      userId: 1,
      teamId: 7,
    });

    expect(findFirst.mock.calls[0][0].where).toEqual({ teamId: 7, appId: "stripe" });
  });
});
