import { afterEach, describe, expect, it, vi } from "vitest";
import { getAllowedEmailDomains } from "../create.handler";

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
