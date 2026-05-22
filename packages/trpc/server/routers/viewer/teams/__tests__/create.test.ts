import { afterEach, describe, expect, it, vi } from "vitest";

import { MembershipRole } from "@calcom/prisma/enums";

import { createHandler, getAllowedEmailDomains } from "../create.handler";

const teamCreate = vi.fn();
const teamFindFirst = vi.fn().mockResolvedValue(null);
const membershipCount = vi.fn().mockResolvedValue(0);

vi.mock("@calcom/prisma", () => ({
  prisma: {
    team: {
      get findFirst() {
        return teamFindFirst;
      },
      get create() {
        return teamCreate;
      },
    },
    membership: {
      get count() {
        return membershipCount;
      },
    },
  },
}));

vi.mock("@calcom/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {} },
}));

describe("createHandler — privacy-by-default (SEC-307+308-FORK)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("creates the team with isPrivate=true regardless of caller input", async () => {
    teamCreate.mockResolvedValueOnce({ id: 1, slug: "engineers", name: "Engineers" });
    await createHandler({
      ctx: { user: { id: 42, email: "u@example.com" } as never },
      input: { slug: "engineers", name: "Engineers" },
    });
    expect(teamCreate).toHaveBeenCalledTimes(1);
    const arg = teamCreate.mock.calls[0][0];
    expect(arg.data.isPrivate).toBe(true);
    expect(arg.data.isOrganization).toBe(false);
    expect(arg.data.members.create).toEqual({
      userId: 42,
      role: MembershipRole.OWNER,
      accepted: true,
    });
  });

  it("rejects an invalid slug before any DB call", async () => {
    await expect(
      createHandler({
        ctx: { user: { id: 42, email: "u@example.com" } as never },
        input: { slug: "Engineers!", name: "x" },
      })
    ).rejects.toThrow(/lowercase/);
    expect(teamCreate).not.toHaveBeenCalled();
  });
});

describe("createHandler — SEC-303-FORK quota", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    membershipCount.mockResolvedValue(0);
  });

  it("rejects when the caller already owns the default max (50)", async () => {
    membershipCount.mockResolvedValueOnce(50);
    await expect(
      createHandler({
        ctx: { user: { id: 1, email: "u@example.com" } as never },
        input: { slug: "ok-slug", name: "x" },
      })
    ).rejects.toThrow(/maximum number of teams/);
    expect(teamCreate).not.toHaveBeenCalled();
  });

  it("honors MAX_TEAMS_PER_USER override", async () => {
    vi.stubEnv("MAX_TEAMS_PER_USER", "3");
    membershipCount.mockResolvedValueOnce(3);
    await expect(
      createHandler({
        ctx: { user: { id: 1, email: "u@example.com" } as never },
        input: { slug: "ok-slug", name: "x" },
      })
    ).rejects.toThrow(/maximum number of teams \(3\)/);
  });

  it("creates when under the quota", async () => {
    membershipCount.mockResolvedValueOnce(49);
    teamCreate.mockResolvedValueOnce({ id: 1, slug: "ok-slug", name: "x" });
    await expect(
      createHandler({
        ctx: { user: { id: 1, email: "u@example.com" } as never },
        input: { slug: "ok-slug", name: "x" },
      })
    ).resolves.toBeDefined();
    expect(teamCreate).toHaveBeenCalledOnce();
  });
});

describe("getAllowedEmailDomains", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when TEAMS_ALLOWED_EMAIL_DOMAINS is unset (open instance)", () => {
    vi.stubEnv("TEAMS_ALLOWED_EMAIL_DOMAINS", "");
    expect(getAllowedEmailDomains()).toBeNull();
  });

  it("parses a single domain", () => {
    vi.stubEnv("TEAMS_ALLOWED_EMAIL_DOMAINS", "clever-cloud.com");
    expect(getAllowedEmailDomains()).toEqual(new Set(["clever-cloud.com"]));
  });

  it("parses comma-separated domains and lowercases them", () => {
    vi.stubEnv("TEAMS_ALLOWED_EMAIL_DOMAINS", "Clever-Cloud.com, clever-cloud.dev");
    expect(getAllowedEmailDomains()).toEqual(new Set(["clever-cloud.com", "clever-cloud.dev"]));
  });

  it("trims whitespace and ignores empty entries", () => {
    vi.stubEnv("TEAMS_ALLOWED_EMAIL_DOMAINS", " a.com , , b.com , ");
    expect(getAllowedEmailDomains()).toEqual(new Set(["a.com", "b.com"]));
  });

  it("returns null when the var is only whitespace/commas", () => {
    vi.stubEnv("TEAMS_ALLOWED_EMAIL_DOMAINS", " , , ");
    expect(getAllowedEmailDomains()).toBeNull();
  });
});
