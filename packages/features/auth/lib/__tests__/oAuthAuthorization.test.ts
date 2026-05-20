import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@calcom/prisma", () => ({
  default: {
    user: { findUnique: vi.fn() },
    team: { findUnique: vi.fn() },
  },
}));

describe("oAuthAuthorization (SEC-003)", () => {
  const originalEnv = process.env.CALENDSO_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.CALENDSO_ENCRYPTION_KEY = originalEnv;
    vi.resetModules();
  });

  it("throws when CALENDSO_ENCRYPTION_KEY is undefined (rather than silently returning null)", async () => {
    delete process.env.CALENDSO_ENCRYPTION_KEY;
    const { default: isAuthorized } = await import("../oAuthAuthorization");
    await expect(isAuthorized("any-token")).rejects.toThrow(/CALENDSO_ENCRYPTION_KEY/);
  });

  it("throws when CALENDSO_ENCRYPTION_KEY is an empty string", async () => {
    process.env.CALENDSO_ENCRYPTION_KEY = "";
    const { default: isAuthorized } = await import("../oAuthAuthorization");
    await expect(isAuthorized("any-token")).rejects.toThrow(/CALENDSO_ENCRYPTION_KEY/);
  });

  describe("with a configured key", () => {
    beforeEach(() => {
      process.env.CALENDSO_ENCRYPTION_KEY = "some-real-key";
    });

    it("returns null for a malformed token", async () => {
      const { default: isAuthorized } = await import("../oAuthAuthorization");
      expect(await isAuthorized("not-a-jwt")).toBeNull();
    });

    it("returns null for a token signed with a different key (signature fails)", async () => {
      const forged = jwt.sign(
        { token_type: "Access Token", scope: [], userId: 1 },
        "the-attackers-key"
      );
      const { default: isAuthorized } = await import("../oAuthAuthorization");
      expect(await isAuthorized(forged)).toBeNull();
    });

    it("returns null if required scopes are missing", async () => {
      const token = jwt.sign(
        { token_type: "Access Token", scope: ["read"], userId: 1 },
        "some-real-key"
      );
      const { default: isAuthorized } = await import("../oAuthAuthorization");
      expect(await isAuthorized(token, ["write"])).toBeNull();
    });

    it("returns null if token_type is not 'Access Token'", async () => {
      const token = jwt.sign(
        { token_type: "Refresh Token", scope: ["read"], userId: 1 },
        "some-real-key"
      );
      const { default: isAuthorized } = await import("../oAuthAuthorization");
      expect(await isAuthorized(token)).toBeNull();
    });
  });
});
