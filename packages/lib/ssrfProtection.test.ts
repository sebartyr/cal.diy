import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Default mock for Cal.diy SaaS (IS_SELF_HOSTED = false)
vi.mock("@calcom/lib/constants", () => ({
  IS_SELF_HOSTED: false,
  IS_PRODUCTION: false,
}));

import {
  assertUrlIsSafeForSSRF,
  fetchWithSSRFProtection,
  isBlockedHostname,
  isPrivateIP,
  isTrustedInternalUrl,
  validateUrlForSSRFSync,
} from "./ssrfProtection";

describe("isPrivateIP", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "169.254.169.254", // AWS metadata
    "0.0.0.0",
    "100.64.0.1", // RFC 6598 CGNAT start
    "100.127.255.254", // RFC 6598 CGNAT end
  ])("blocks private IPv4 %s", (ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it.each([
    "172.15.255.255", // just outside 172.16.0.0/12
    "172.32.0.0", // just outside 172.16.0.0/12
    "8.8.8.8", // Google DNS
    "1.1.1.1", // Cloudflare DNS
    "100.63.255.255", // just below RFC 6598
    "100.128.0.0", // just above RFC 6598
  ])("allows public IPv4 %s", (ip) => {
    expect(isPrivateIP(ip)).toBe(false);
  });

  it.each(["::1", "::", "fc00::1", "fd00::1", "fe80::1"])("blocks private IPv6 %s", (ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it("allows public IPv6 addresses", () => {
    expect(isPrivateIP("2001:4860:4860::8888")).toBe(false); // Google DNS
  });

  it("blocks IPv4-mapped IPv6 addresses", () => {
    expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIP("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIP("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateIP("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("isBlockedHostname", () => {
  it.each([
    "localhost",
    "127.0.0.1",
    "::1",
    "[::1]",
    "0.0.0.0",
    "169.254.169.254",
    "metadata.google.internal",
    "169.254.169.254.",
    "METADATA.GOOGLE.INTERNAL",
  ])("blocks %s", (hostname) => {
    expect(isBlockedHostname(hostname)).toBe(true);
  });

  it("allows regular hostnames", () => {
    expect(isBlockedHostname("example.com")).toBe(false);
  });
});

describe("validateUrlForSSRFSync", () => {
  it("allows HTTPS URLs", () => {
    expect(validateUrlForSSRFSync("https://example.com/logo.png").isValid).toBe(true);
  });

  it("allows image data URLs", () => {
    expect(validateUrlForSSRFSync("data:image/png;base64,iVBORw0KGgo=").isValid).toBe(true);
  });

  it("allows /api/avatar/{uuid}.png only", () => {
    expect(validateUrlForSSRFSync("/api/avatar/ba0fa3a6-2aac-4032-8230-3789f5752e5a.png").isValid).toBe(true);
    expect(validateUrlForSSRFSync("/api/avatar/any-value.png").isValid).toBe(true);
  });

  it("rejects /api/avatar/ path without .png extension", () => {
    expect(validateUrlForSSRFSync("/api/avatar/ba0fa3a6-2aac-4032-8230-3789f5752e5a").isValid).toBe(false);
    expect(validateUrlForSSRFSync("/api/avatar/foo.jpg").isValid).toBe(false);
  });

  it("rejects other path-only URLs", () => {
    expect(validateUrlForSSRFSync("/api/logo.png").isValid).toBe(false);
    expect(validateUrlForSSRFSync("/other/path").isValid).toBe(false);
  });

  it("rejects protocol-relative URLs (SSRF: could target metadata or internal hosts)", () => {
    expect(validateUrlForSSRFSync("//169.254.169.254/latest/meta-data/").isValid).toBe(false);
    expect(validateUrlForSSRFSync("//metadata.google.internal/").isValid).toBe(false);
  });

  it.each([
    ["http://example.com/logo.png", "Only HTTPS URLs are allowed"],
    ["ftp://example.com/file", "Only HTTPS URLs are allowed"],
    ["data:text/html,<script>alert(1)</script>", "Non-image data URL"],
    ["https://127.0.0.1/logo.png", "Blocked hostname"],
    ["https://0.0.0.0/logo.png", "Blocked hostname"],
    ["https://169.254.169.254/latest/meta-data/", "Blocked hostname"],
    ["https://localhost/logo.png", "Blocked hostname"],
    ["not-a-url", "Invalid URL format"],
  ])("blocks %s", (url, expectedError) => {
    const result = validateUrlForSSRFSync(url);
    expect(result).toEqual({ isValid: false, error: expectedError });
  });

  it.each([
    ["https://[::1]/", "Blocked hostname"],
    ["https://[fe80::1]/path", "Private IP address"],
    ["https://[fc00::1]:8080/", "Private IP address"],
    ["https://[::ffff:127.0.0.1]/", "Private IP address"],
  ])("blocks IPv6 private addresses with brackets %s", (url, expectedError) => {
    const result = validateUrlForSSRFSync(url);
    expect(result).toEqual({ isValid: false, error: expectedError });
  });

  it("allows public IPv6 addresses", () => {
    expect(validateUrlForSSRFSync("https://[2001:4860:4860::8888]/").isValid).toBe(true);
  });
});

describe("isTrustedInternalUrl", () => {
  const webappUrl = "https://app.cal.com";

  it("returns true for same origin", () => {
    expect(isTrustedInternalUrl("https://app.cal.com/logo.png", webappUrl)).toBe(true);
  });

  it("returns false for different origins and invalid URLs", () => {
    expect(isTrustedInternalUrl("https://evil.com/logo.png", webappUrl)).toBe(false);
    expect(isTrustedInternalUrl("https://app.cal.com.evil.com/x", webappUrl)).toBe(false);
    expect(isTrustedInternalUrl("not-a-url", webappUrl)).toBe(false);
  });
});

describe("HTTP webhook exceptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows localhost HTTP when NEXT_PUBLIC_IS_E2E=1", () => {
    vi.stubEnv("NEXT_PUBLIC_IS_E2E", "1");
    expect(validateUrlForSSRFSync("http://localhost:3000/webhook").isValid).toBe(true);
    expect(validateUrlForSSRFSync("http://127.0.0.1:4000/webhook").isValid).toBe(true);
  });

  it("still blocks non-localhost URLs in E2E environment", () => {
    vi.stubEnv("NEXT_PUBLIC_IS_E2E", "1");
    expect(validateUrlForSSRFSync("http://evil.com/webhook").isValid).toBe(false);
    expect(validateUrlForSSRFSync("http://192.168.1.1/webhook").isValid).toBe(false);
  });
});

describe("assertUrlIsSafeForSSRF", () => {
  it("accepts public HTTPS URLs", async () => {
    await expect(assertUrlIsSafeForSSRF("https://8.8.8.8/calendar.ics")).resolves.toBeUndefined();
  });

  it.each([
    "https://169.254.169.254/latest/meta-data/",
    "https://10.0.0.5/ews/exchange.asmx",
    "http://8.8.8.8/insecure",
    "data:image/png;base64,iVBORw0KGgo=",
    "/api/avatar/foo.png",
    "file:///etc/passwd",
  ])("rejects %s with a generic message", async (url) => {
    await expect(assertUrlIsSafeForSSRF(url)).rejects.toThrow("URL is not allowed");
  });
});

describe("fetchWithSSRFProtection", () => {
  const fetchMock = vi.fn();

  const redirectTo = (location: string, status = 302) =>
    new Response(null, { status, headers: { location } });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables automatic redirects and returns non-redirect responses", async () => {
    fetchMock.mockResolvedValueOnce(new Response("BEGIN:VCALENDAR", { status: 200 }));

    const response = await fetchWithSSRFProtection("https://8.8.8.8/feed.ics");

    expect(await response.text()).toBe("BEGIN:VCALENDAR");
    expect(fetchMock).toHaveBeenCalledWith("https://8.8.8.8/feed.ics", { redirect: "manual" });
  });

  it("never fetches a URL that fails validation", async () => {
    await expect(fetchWithSSRFProtection("https://169.254.169.254/latest")).rejects.toThrow(
      "URL is not allowed"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows safe redirects, resolving relative locations", async () => {
    fetchMock
      .mockResolvedValueOnce(redirectTo("/moved/feed.ics", 301))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await fetchWithSSRFProtection("https://8.8.8.8/feed.ics");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenLastCalledWith("https://8.8.8.8/moved/feed.ics", { redirect: "manual" });
  });

  it.each([
    "https://169.254.169.254/latest/meta-data/",
    "https://192.168.1.10/internal",
    "http://8.8.4.4/downgrade",
  ])("blocks a redirect to %s", async (location) => {
    fetchMock.mockResolvedValueOnce(redirectTo(location));

    await expect(fetchWithSSRFProtection("https://8.8.8.8/feed.ics")).rejects.toThrow("URL is not allowed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops after the maximum number of redirects", async () => {
    fetchMock.mockImplementation(async () => redirectTo("https://8.8.8.8/loop"));

    await expect(
      fetchWithSSRFProtection("https://8.8.8.8/feed.ics", {}, { maxRedirects: 2 })
    ).rejects.toThrow("Too many redirects");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns a redirect response without a location header as-is", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302 }));

    const response = await fetchWithSSRFProtection("https://8.8.8.8/feed.ics");

    expect(response.status).toBe(302);
  });
});

// Test self-hosted behavior with separate describe block using vi.doMock
describe("Self-hosted environment behavior", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("@calcom/lib/constants", () => ({
      IS_SELF_HOSTED: true,
      IS_PRODUCTION: false,
    }));
  });

  afterEach(() => {
    vi.doUnmock("@calcom/lib/constants");
  });

  it("allows private IPs for self-hosted (internal webhooks)", async () => {
    const { validateUrlForSSRFSync: validateSelfHosted } = await import("./ssrfProtection");
    expect(validateSelfHosted("http://192.168.1.1/webhook").isValid).toBe(true);
    expect(validateSelfHosted("http://10.0.0.1/webhook").isValid).toBe(true);
    expect(validateSelfHosted("http://172.16.0.1/webhook").isValid).toBe(true);
  });

  it("allows HTTP URLs for self-hosted", async () => {
    const { validateUrlForSSRFSync: validateSelfHosted } = await import("./ssrfProtection");
    expect(validateSelfHosted("http://internal-service.local/webhook").isValid).toBe(true);
    expect(validateSelfHosted("http://localhost:3000/webhook").isValid).toBe(true);
  });

  it("still blocks cloud metadata endpoints even on self-hosted", async () => {
    const { validateUrlForSSRFSync: validateSelfHosted } = await import("./ssrfProtection");
    // AWS/Azure/DigitalOcean/Oracle metadata
    expect(validateSelfHosted("http://169.254.169.254/latest/meta-data/").isValid).toBe(false);
    // GCP metadata
    expect(validateSelfHosted("http://metadata.google.internal/computeMetadata/v1/").isValid).toBe(false);
    expect(validateSelfHosted("http://metadata.google.com/computeMetadata/v1/").isValid).toBe(false);
    // Azure alternate
    expect(validateSelfHosted("http://169.254.169.253/metadata/instance").isValid).toBe(false);
  });

  it("allows HTTPS URLs for self-hosted", async () => {
    const { validateUrlForSSRFSync: validateSelfHosted } = await import("./ssrfProtection");
    expect(validateSelfHosted("https://example.com/webhook").isValid).toBe(true);
  });

  it("blocks non-HTTP protocols for self-hosted", async () => {
    const { validateUrlForSSRFSync: validateSelfHosted } = await import("./ssrfProtection");
    expect(validateSelfHosted("file:///etc/passwd").isValid).toBe(false);
    expect(validateSelfHosted("ftp://internal-server/file").isValid).toBe(false);
    expect(validateSelfHosted("javascript:alert(1)").isValid).toBe(false);
  });
});
