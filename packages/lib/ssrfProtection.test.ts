import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));

// Default mock for Cal.diy SaaS (IS_SELF_HOSTED = false)
vi.mock("@calcom/lib/constants", () => ({
  IS_SELF_HOSTED: false,
  IS_PRODUCTION: false,
}));

vi.mock("node:dns/promises", () => ({ default: { lookup: lookupMock } }));

import {
  assertUrlIsSafeForSSRF,
  classifyIP,
  createSSRFProtectedFetch,
  fetchWithSSRFProtection,
  isBlockedHostname,
  isIPAllowedForHost,
  isPrivateIP,
  isTrustedInternalUrl,
  validateUrlForSSRF,
  validateUrlForSSRFSync,
} from "./ssrfProtection";

type LookupResult = { address: string; family: number }[];

function resolvesTo(...addresses: string[]): void {
  const records: LookupResult = addresses.map((address) => ({
    address,
    family: address.includes(":") ? 6 : 4,
  }));
  lookupMock.mockResolvedValue(records);
}

beforeEach(() => {
  lookupMock.mockReset();
  resolvesTo("93.184.215.14");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("classifyIP", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["127.255.255.254", "loopback"],
    ["::1", "IPv6 loopback"],
    ["169.254.0.1", "link-local"],
    ["169.254.169.254", "AWS/GCP/Azure metadata"],
    ["fe80::1", "IPv6 link-local"],
    ["0.0.0.0", "unspecified"],
    ["0.1.2.3", "0.0.0.0/8"],
    ["::", "IPv6 unspecified"],
    ["224.0.0.1", "multicast"],
    ["239.255.255.250", "multicast"],
    ["ff02::1", "IPv6 multicast"],
    ["255.255.255.255", "broadcast"],
    ["240.0.0.1", "reserved"],
    ["192.0.2.1", "documentation"],
    ["198.18.0.1", "benchmarking"],
    ["2001:db8::1", "IPv6 documentation"],
    ["fd00:ec2::254", "AWS IMDS IPv6 (inside fc00::/7)"],
    ["100.100.100.200", "Alibaba metadata (inside CGNAT)"],
    ["169.254.170.2", "AWS ECS metadata"],
    ["2001:0:4136:e378:8000:63bf:3fff:fdd2", "Teredo"],
  ])("always blocks %s (%s)", (ip) => {
    expect(classifyIP(ip)).toBe("blocked");
  });

  it.each([
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
    ["::ffff:a9fe:a9fe", "IPv4-mapped metadata, hex form"],
    ["::ffff:169.254.169.254", "IPv4-mapped metadata, dotted form"],
    ["[::ffff:a9fe:a9fe]", "bracketed URL hostname form"],
    ["0:0:0:0:0:ffff:7f00:1", "IPv4-mapped loopback, expanded"],
    ["::7f00:1", "IPv4-compatible loopback"],
    ["::127.0.0.1", "IPv4-compatible loopback, dotted"],
    ["64:ff9b::a9fe:a9fe", "NAT64 metadata"],
    ["64:ff9b:1::7f00:1", "local-use NAT64 loopback"],
    ["2002:7f00:1::", "6to4 loopback"],
    ["::ffff:0:a9fe:a9fe", "SIIT (RFC 6145) metadata"],
  ])("normalizes embedded IPv4 before checking %s (%s)", (ip) => {
    expect(classifyIP(ip)).toBe("blocked");
  });

  it.each([
    ["2130706433", "decimal integer"],
    ["0x7f000001", "hex integer"],
    ["0x7f.1", "hex short form"],
    ["0177.0.0.1", "octal"],
    ["127.1", "short form"],
    ["0xa9.0xfe.0xa9.0xfe", "hex metadata"],
  ])("parses exotic IPv4 notation %s (%s)", (ip) => {
    expect(classifyIP(ip)).toBe("blocked");
  });

  it.each([
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "100.64.0.1", // RFC 6598 CGNAT start
    "100.127.255.254", // RFC 6598 CGNAT end
    "fc00::1",
    "fd12:3456::1",
    "fec0::1", // deprecated site-local
    "::ffff:10.0.0.1",
    "64:ff9b::a00:1", // NAT64 to 10.0.0.1
  ])("classifies %s as private", (ip) => {
    expect(classifyIP(ip)).toBe("private");
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.15.255.255", // just outside 172.16.0.0/12
    "172.32.0.0",
    "100.63.255.255", // just below RFC 6598
    "100.128.0.0", // just above RFC 6598
    "2001:4860:4860::8888",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
  ])("classifies %s as public", (ip) => {
    expect(classifyIP(ip)).toBe("public");
  });

  it.each(["", "not-an-ip", "example.com", "999.1.1.1"])("fails closed on unparseable input %j", (ip) => {
    expect(classifyIP(ip)).toBe("blocked");
  });
});

describe("isPrivateIP", () => {
  it("is true for blocked and private addresses, false for public ones", () => {
    expect(isPrivateIP("127.0.0.1")).toBe(true);
    expect(isPrivateIP("10.0.0.1")).toBe(true);
    expect(isPrivateIP("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateIP("8.8.8.8")).toBe(false);
  });
});

describe("SSRF_ALLOWED_PRIVATE_HOSTS", () => {
  it("does not allow private addresses by default", () => {
    expect(isIPAllowedForHost("10.0.0.5", "caldav.internal")).toBe(false);
    expect(isIPAllowedForHost("8.8.8.8", "dns.google")).toBe(true);
  });

  it("allows private addresses reached through an allowlisted hostname", () => {
    vi.stubEnv("SSRF_ALLOWED_PRIVATE_HOSTS", " CalDAV.Internal. , exchange.corp ");
    expect(isIPAllowedForHost("10.0.0.5", "caldav.internal")).toBe(true);
    expect(isIPAllowedForHost("fd00::5", "exchange.corp")).toBe(true);
    expect(isIPAllowedForHost("10.0.0.5", "other.internal")).toBe(false);
    expect(isIPAllowedForHost("10.0.0.5", "sub.caldav.internal")).toBe(false);
  });

  it("allows private addresses inside an allowlisted CIDR or IP", () => {
    vi.stubEnv("SSRF_ALLOWED_PRIVATE_HOSTS", "10.20.0.0/16,192.168.1.10,fd00:1234::/32");
    expect(isIPAllowedForHost("10.20.3.4", "anything.example")).toBe(true);
    expect(isIPAllowedForHost("::ffff:10.20.3.4", "anything.example")).toBe(true);
    expect(isIPAllowedForHost("10.21.0.1", "anything.example")).toBe(false);
    expect(isIPAllowedForHost("192.168.1.10", "192.168.1.10")).toBe(true);
    expect(isIPAllowedForHost("192.168.1.11", "192.168.1.11")).toBe(false);
    expect(isIPAllowedForHost("fd00:1234::1", "anything.example")).toBe(true);
    expect(isIPAllowedForHost("fd00:9999::1", "anything.example")).toBe(false);
  });

  it("never opens loopback, link-local or metadata addresses", () => {
    vi.stubEnv(
      "SSRF_ALLOWED_PRIVATE_HOSTS",
      "evil.example,127.0.0.0/8,169.254.0.0/16,100.64.0.0/10,fd00::/8,0.0.0.0/0"
    );
    expect(isIPAllowedForHost("127.0.0.1", "evil.example")).toBe(false);
    expect(isIPAllowedForHost("169.254.169.254", "evil.example")).toBe(false);
    expect(isIPAllowedForHost("::ffff:a9fe:a9fe", "evil.example")).toBe(false);
    expect(isIPAllowedForHost("100.100.100.200", "evil.example")).toBe(false);
    expect(isIPAllowedForHost("fd00:ec2::254", "evil.example")).toBe(false);
    expect(isIPAllowedForHost("100.64.0.1", "evil.example")).toBe(true);
  });

  it("re-reads the variable when it changes", () => {
    vi.stubEnv("SSRF_ALLOWED_PRIVATE_HOSTS", "10.0.0.0/8");
    expect(isIPAllowedForHost("10.0.0.1", "a.example")).toBe(true);
    vi.stubEnv("SSRF_ALLOWED_PRIVATE_HOSTS", "");
    expect(isIPAllowedForHost("10.0.0.1", "a.example")).toBe(false);
  });

  it("ignores empty entries", () => {
    vi.stubEnv("SSRF_ALLOWED_PRIVATE_HOSTS", ",, ,");
    expect(isIPAllowedForHost("10.0.0.1", "")).toBe(false);
  });
});

describe("isBlockedHostname", () => {
  it.each([
    "localhost",
    "foo.localhost",
    "127.0.0.1",
    "::1",
    "[::1]",
    "0.0.0.0",
    "169.254.169.254",
    "metadata",
    "metadata.google.internal",
    "instance-data.ec2.internal",
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
    ["https://app.localhost/logo.png", "Blocked hostname"],
    ["https://10.0.0.1/logo.png", "Private IP address"],
    ["https://0x7f.1/", "Blocked hostname"],
    ["https://2130706433/", "Blocked hostname"],
    ["https://0xa9fea9fe/", "Blocked hostname"],
    ["https://127.0.0.2/", "Private IP address"],
    ["not-a-url", "Invalid URL format"],
  ])("blocks %s", (url, expectedError) => {
    expect(validateUrlForSSRFSync(url)).toEqual({ isValid: false, error: expectedError });
  });

  it.each([
    ["https://[::1]/", "Blocked hostname"],
    ["https://[fe80::1]/path", "Private IP address"],
    ["https://[fc00::1]:8080/", "Private IP address"],
    ["https://[::ffff:127.0.0.1]/", "Private IP address"],
    ["https://[::ffff:169.254.169.254]/", "Private IP address"],
    ["https://[64:ff9b::a9fe:a9fe]/", "Private IP address"],
    ["https://[fd00:ec2::254]/", "Private IP address"],
  ])("blocks IPv6 private addresses with brackets %s", (url, expectedError) => {
    expect(validateUrlForSSRFSync(url)).toEqual({ isValid: false, error: expectedError });
  });

  it("allows public IPv6 addresses", () => {
    expect(validateUrlForSSRFSync("https://[2001:4860:4860::8888]/").isValid).toBe(true);
  });

  it("allows an allowlisted private IP literal", () => {
    vi.stubEnv("SSRF_ALLOWED_PRIVATE_HOSTS", "10.0.0.0/24");
    expect(validateUrlForSSRFSync("https://10.0.0.7/dav/").isValid).toBe(true);
    expect(validateUrlForSSRFSync("https://10.0.1.7/dav/").isValid).toBe(false);
  });
});

describe("validateUrlForSSRF (DNS)", () => {
  it("resolves both A and AAAA records", async () => {
    await validateUrlForSSRF("https://example.com/");
    expect(lookupMock).toHaveBeenCalledWith("example.com", { all: true, verbatim: true });
  });

  it("accepts a hostname resolving only to public addresses", async () => {
    resolvesTo("93.184.215.14", "2606:2800:21f:cb07:6820:80da:af6b:8b2c");
    expect(await validateUrlForSSRF("https://example.com/")).toEqual({ isValid: true });
  });

  it.each([
    ["169.254.169.254", "metadata"],
    ["127.0.0.1", "loopback"],
    ["::1", "IPv6 loopback"],
    ["::ffff:a9fe:a9fe", "IPv4-mapped metadata"],
    ["fe80::1", "IPv6 link-local"],
    ["0.0.0.0", "unspecified"],
    ["10.0.0.1", "private"],
    ["192.168.1.1", "private"],
    ["100.64.0.1", "CGNAT"],
    ["fd12::1", "ULA"],
    ["224.0.0.1", "multicast"],
  ])("blocks a hostname resolving to %s (%s)", async (address) => {
    resolvesTo(address);
    expect(await validateUrlForSSRF("https://rebind.example/")).toEqual({
      isValid: false,
      error: "Hostname resolves to private IP",
    });
  });

  it("blocks when any one of several records is internal", async () => {
    resolvesTo("93.184.215.14", "2606:2800::1", "fd00:ec2::254");
    expect((await validateUrlForSSRF("https://mixed.example/")).isValid).toBe(false);
  });

  it("fails closed when DNS resolution fails", async () => {
    lookupMock.mockRejectedValue(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }));
    expect(await validateUrlForSSRF("https://nxdomain.example/")).toEqual({
      isValid: false,
      error: "Hostname could not be resolved",
    });
  });

  it("fails closed on an empty answer", async () => {
    lookupMock.mockResolvedValue([]);
    expect((await validateUrlForSSRF("https://empty.example/")).isValid).toBe(false);
  });

  it("does not resolve IP literals", async () => {
    expect((await validateUrlForSSRF("https://8.8.8.8/")).isValid).toBe(true);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("allows an allowlisted hostname resolving to a private network", async () => {
    vi.stubEnv("SSRF_ALLOWED_PRIVATE_HOSTS", "caldav.corp.example");
    resolvesTo("10.1.2.3");
    expect((await validateUrlForSSRF("https://caldav.corp.example/dav/")).isValid).toBe(true);
    expect((await validateUrlForSSRF("https://other.corp.example/dav/")).isValid).toBe(false);
  });

  it("allows any hostname resolving inside an allowlisted CIDR", async () => {
    vi.stubEnv("SSRF_ALLOWED_PRIVATE_HOSTS", "10.1.0.0/16");
    resolvesTo("10.1.2.3");
    expect((await validateUrlForSSRF("https://whatever.corp.example/")).isValid).toBe(true);
  });

  it("keeps blocking metadata and loopback for an allowlisted hostname", async () => {
    vi.stubEnv("SSRF_ALLOWED_PRIVATE_HOSTS", "caldav.corp.example");
    resolvesTo("10.1.2.3", "169.254.169.254");
    expect((await validateUrlForSSRF("https://caldav.corp.example/")).isValid).toBe(false);
    resolvesTo("127.0.0.1");
    expect((await validateUrlForSSRF("https://caldav.corp.example/")).isValid).toBe(false);
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

  it("rejects a hostname that resolves to an internal address", async () => {
    resolvesTo("::ffff:169.254.169.254");
    await expect(assertUrlIsSafeForSSRF("https://rebind.example/dav/")).rejects.toThrow("URL is not allowed");
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
    "https://[::ffff:a9fe:a9fe]/latest/meta-data/",
    "http://8.8.4.4/downgrade",
  ])("blocks a redirect to %s", async (location) => {
    fetchMock.mockResolvedValueOnce(redirectTo(location));

    await expect(fetchWithSSRFProtection("https://8.8.8.8/feed.ics")).rejects.toThrow("URL is not allowed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect to a hostname that resolves internally", async () => {
    fetchMock.mockResolvedValueOnce(redirectTo("https://internal.example/"));
    resolvesTo("10.0.0.1");

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

describe("createSSRFProtectedFetch", () => {
  const fetchMock = vi.fn();
  const guardedFetch = createSSRFProtectedFetch({ integration: "test" });

  const redirectTo = (location: string, status: number) =>
    new Response(null, { status, headers: { location } });
  const sentRequest = (index: number) => {
    const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
    const headers = new Headers(init.headers);
    return { url, method: init.method, body: init.body, authorization: headers.get("authorization") };
  };
  const davInit = (method: string): RequestInit => ({
    method,
    body: "<d:propfind/>",
    headers: { authorization: "Basic dGVzdDp0ZXN0", depth: "1" },
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([307, 308])("replays the method, body and headers on a %i", async (status) => {
    fetchMock
      .mockResolvedValueOnce(redirectTo("/moved/event.ics", status))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));

    const response = await guardedFetch("https://8.8.8.8/event.ics", davInit("PUT"));

    expect(response.status).toBe(201);
    expect(sentRequest(1)).toEqual({
      url: "https://8.8.8.8/moved/event.ics",
      method: "PUT",
      body: "<d:propfind/>",
      authorization: "Basic dGVzdDp0ZXN0",
    });
  });

  it.each(["PROPFIND", "REPORT", "GET"])("follows a 301/302 unchanged for %s", async (method) => {
    fetchMock
      .mockResolvedValueOnce(redirectTo("https://8.8.8.8/dav/", 301))
      .mockResolvedValueOnce(redirectTo("https://8.8.8.8/dav2/", 302))
      .mockResolvedValueOnce(new Response("ok", { status: 207 }));

    const response = await guardedFetch("https://8.8.8.8/dav", davInit(method));

    expect(response.status).toBe(207);
    expect(sentRequest(2)).toEqual(
      expect.objectContaining({ url: "https://8.8.8.8/dav2/", method, body: "<d:propfind/>" })
    );
  });

  it.each([
    ["PUT", 301],
    ["PUT", 302],
    ["DELETE", 302],
    ["POST", 302],
    ["PUT", 303],
    ["PROPFIND", 303],
  ])("returns the redirect of a %s answered with a %i without following it", async (method, status) => {
    fetchMock.mockResolvedValueOnce(redirectTo("https://8.8.4.4/elsewhere", status));

    const response = await guardedFetch("https://8.8.8.8/event.ics", davInit(method));

    expect(response.status).toBe(status);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows a 303 for a GET", async () => {
    fetchMock
      .mockResolvedValueOnce(redirectTo("/result", 303))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await guardedFetch("https://8.8.8.8/feed.ics");

    expect(response.status).toBe(200);
    expect(sentRequest(1).url).toBe("https://8.8.8.8/result");
  });

  it("drops credentials once a redirect leaves the origin, even when coming back", async () => {
    fetchMock
      .mockResolvedValueOnce(redirectTo("https://8.8.8.8/same-origin/", 307))
      .mockResolvedValueOnce(redirectTo("https://8.8.4.4/other-origin/", 307))
      .mockResolvedValueOnce(redirectTo("https://8.8.8.8/back/", 307))
      .mockResolvedValueOnce(new Response("ok", { status: 207 }));

    await guardedFetch("https://8.8.8.8/dav/", {
      ...davInit("PROPFIND"),
      headers: { Authorization: "Basic dGVzdDp0ZXN0", Cookie: "session=1", "Proxy-Authorization": "x" },
    });

    expect([0, 1, 2, 3].map((index) => sentRequest(index).authorization)).toEqual([
      "Basic dGVzdDp0ZXN0",
      "Basic dGVzdDp0ZXN0",
      null,
      null,
    ]);
    const lastHeaders = new Headers((fetchMock.mock.calls[3] as [string, RequestInit])[1].headers);
    expect(lastHeaders.get("cookie")).toBeNull();
    expect(lastHeaders.get("proxy-authorization")).toBeNull();
  });

  it("blocks a redirect of a write to an internal address", async () => {
    fetchMock.mockResolvedValueOnce(redirectTo("http://169.254.169.254/latest/meta-data/", 307));

    await expect(guardedFetch("https://8.8.8.8/event.ics", davInit("DELETE"))).rejects.toThrow(
      "URL is not allowed"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns redirects untouched to a caller asking for redirect: manual, after validating the URL", async () => {
    fetchMock.mockResolvedValueOnce(redirectTo("http://169.254.169.254/", 302));

    const response = await guardedFetch("https://8.8.8.8/.well-known/caldav", { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(guardedFetch("https://169.254.169.254/", { redirect: "manual" })).rejects.toThrow(
      "URL is not allowed"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a redirect when the caller asks for redirect: error", async () => {
    fetchMock.mockResolvedValueOnce(redirectTo("https://8.8.8.8/moved", 301));

    await expect(guardedFetch("https://8.8.8.8/feed.ics", { redirect: "error" })).rejects.toThrow(
      "Unexpected redirect"
    );
  });

  it("refuses Request objects, whose body could not be replayed", async () => {
    await expect(guardedFetch(new Request("https://8.8.8.8/feed.ics"))).rejects.toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Self-hosted environment behavior", () => {
  async function importSelfHosted() {
    vi.resetModules();
    vi.doMock("@calcom/lib/constants", () => ({
      IS_SELF_HOSTED: true,
      IS_PRODUCTION: false,
    }));
    return import("./ssrfProtection");
  }

  afterEach(() => {
    vi.doUnmock("@calcom/lib/constants");
  });

  it("blocks private IPs by default", async () => {
    const { validateUrlForSSRFSync: validateSelfHosted } = await importSelfHosted();
    expect(validateSelfHosted("http://192.168.1.1/webhook").isValid).toBe(false);
    expect(validateSelfHosted("http://10.0.0.1/webhook").isValid).toBe(false);
    expect(validateSelfHosted("http://172.16.0.1/webhook").isValid).toBe(false);
    expect(validateSelfHosted("http://100.64.0.1/webhook").isValid).toBe(false);
    expect(validateSelfHosted("http://[fd00::1]/webhook").isValid).toBe(false);
  });

  it("allows allowlisted private networks over HTTP", async () => {
    vi.stubEnv("SSRF_ALLOWED_PRIVATE_HOSTS", "192.168.1.0/24,caldav.lan");
    const { validateUrlForSSRF: validateSelfHosted } = await importSelfHosted();
    expect((await validateSelfHosted("http://192.168.1.1/webhook")).isValid).toBe(true);
    resolvesTo("10.9.9.9");
    expect((await validateSelfHosted("http://caldav.lan:5232/user/")).isValid).toBe(true);
    expect((await validateSelfHosted("http://other.lan/")).isValid).toBe(false);
  });

  it("allows HTTP URLs to public hosts", async () => {
    const { validateUrlForSSRF: validateSelfHosted } = await importSelfHosted();
    expect((await validateSelfHosted("http://hooks.example.com/webhook")).isValid).toBe(true);
  });

  it("allows HTTPS URLs", async () => {
    const { validateUrlForSSRFSync: validateSelfHosted } = await importSelfHosted();
    expect(validateSelfHosted("https://example.com/webhook").isValid).toBe(true);
  });

  it.each([
    "http://localhost:3000/webhook",
    "http://127.0.0.1:8080/",
    "http://0x7f.1/",
    "http://2130706433/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:a9fe:a9fe]/latest/meta-data/",
    "http://169.254.169.254/latest/meta-data/",
    "http://169.254.169.253/metadata/instance",
    "http://169.254.170.2/v2/credentials",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://metadata.google.com/computeMetadata/v1/",
    "http://[fd00:ec2::254]/latest/meta-data/",
    "http://100.100.100.200/latest/meta-data/",
    "http://0.0.0.0/",
  ])("always blocks %s, even when every private network is allowlisted", async (url) => {
    vi.stubEnv("SSRF_ALLOWED_PRIVATE_HOSTS", "0.0.0.0/0,::/0,localhost,metadata.google.internal");
    const { validateUrlForSSRF: validateSelfHosted } = await importSelfHosted();
    expect((await validateSelfHosted(url)).isValid).toBe(false);
  });

  it("blocks a hostname resolving to loopback or metadata (DNS rebinding)", async () => {
    const { validateUrlForSSRF: validateSelfHosted } = await importSelfHosted();
    resolvesTo("169.254.169.254");
    expect((await validateSelfHosted("http://attacker.example/")).isValid).toBe(false);
    resolvesTo("::ffff:7f00:1");
    expect((await validateSelfHosted("http://attacker.example/")).isValid).toBe(false);
    resolvesTo("10.0.0.1");
    expect((await validateSelfHosted("http://attacker.example/")).isValid).toBe(false);
  });

  it("blocks non-HTTP protocols", async () => {
    const { validateUrlForSSRFSync: validateSelfHosted } = await importSelfHosted();
    expect(validateSelfHosted("file:///etc/passwd").isValid).toBe(false);
    expect(validateSelfHosted("ftp://internal-server/file").isValid).toBe(false);
    expect(validateSelfHosted("javascript:alert(1)").isValid).toBe(false);
  });
});
