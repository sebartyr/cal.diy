import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@calcom/lib/constants", async () => {
  const actual = await vi.importActual<typeof import("@calcom/lib/constants")>("@calcom/lib/constants");
  return {
    ...actual,
    IS_PRODUCTION: true,
    WEBAPP_URL: "https://example.test",
  };
});

vi.mock("../buildNonce", () => ({
  buildNonce: () => "deadbeef",
}));

describe("getCspHeader (SEC-205 hardened production policy)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("emits nonce + strict-dynamic and drops 'unsafe-inline' https: in prod script-src", async () => {
    const { getCspHeader } = await import("../csp");
    const header = getCspHeader({ mode: "enforce", nonce: "n0nce" });
    expect(header).not.toBeNull();
    const value = header?.value ?? "";

    // Extract just the script-src directive
    const scriptSrcMatch = value.match(/script-src([^;]*);/);
    expect(scriptSrcMatch).not.toBeNull();
    const scriptSrc = scriptSrcMatch![1];

    expect(scriptSrc).toContain("'nonce-n0nce'");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toMatch(/(^|\s)https:(\s|$)/);
  });

  it("returns Report-Only header name when mode='report-only'", async () => {
    const { getCspHeader } = await import("../csp");
    const header = getCspHeader({ mode: "report-only", nonce: "x" });
    expect(header?.name).toBe("Content-Security-Policy-Report-Only");
  });

  it("returns null when mode='off'", async () => {
    const { getCspHeader } = await import("../csp");
    expect(getCspHeader({ mode: "off", nonce: "x" })).toBeNull();
  });

  it("legacy boolean overload still works (true → enforce)", async () => {
    const { getCspHeader } = await import("../csp");
    const header = getCspHeader({ shouldEnforceCsp: true, nonce: "x" });
    expect(header?.name).toBe("Content-Security-Policy");
  });

  it("legacy boolean overload still works (false → null/off)", async () => {
    const { getCspHeader } = await import("../csp");
    expect(getCspHeader({ shouldEnforceCsp: false, nonce: "x" })).toBeNull();
  });
});
