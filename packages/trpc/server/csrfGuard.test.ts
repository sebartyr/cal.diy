import type { IncomingHttpHeaders } from "node:http";
import { describe, expect, it } from "vitest";
import { buildTrustedOrigins, getCsrfRejectionReason } from "./csrfGuard";

const trustedOrigins = buildTrustedOrigins(["https://app.example.com/some/path"]);
const json = { "content-type": "application/json" };

const check = (method: string | undefined, headers: IncomingHttpHeaders) =>
  getCsrfRejectionReason({ method, headers, trustedOrigins });

describe("getCsrfRejectionReason", () => {
  it.each(["GET", "HEAD", "OPTIONS", "get", undefined])("lets safe method %s through", (method) => {
    expect(check(method, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).toBeNull();
  });

  it("rejects a text/plain POST, the classic preflight-free CSRF vector", () => {
    expect(
      check("POST", {
        "content-type": "text/plain",
        origin: "https://app.example.com",
        host: "app.example.com",
      })
    ).toBe("unsupported_content_type");
  });

  it.each([
    "application/x-www-form-urlencoded",
    "multipart/form-data; boundary=x",
  ])("rejects a POST with content type %s", (contentType) => {
    expect(check("POST", { "content-type": contentType })).toBe("unsupported_content_type");
  });

  it("rejects a POST without a content type", () => {
    expect(check("POST", {})).toBe("unsupported_content_type");
  });

  it("accepts JSON with charset parameter and mixed case", () => {
    expect(
      check("POST", { "content-type": "Application/JSON; charset=utf-8", origin: "https://app.example.com" })
    ).toBeNull();
  });

  it("accepts the canonical WEBAPP_URL origin", () => {
    expect(check("POST", { ...json, origin: "https://app.example.com", host: "internal:8080" })).toBeNull();
  });

  it("accepts same-origin requests on another host served by the app (org subdomain, custom domain)", () => {
    expect(
      check("POST", { ...json, origin: "https://acme.example.com", host: "acme.example.com" })
    ).toBeNull();
  });

  it("matches the host forwarded by a reverse proxy", () => {
    expect(
      check("POST", {
        ...json,
        origin: "https://acme.example.com",
        host: "10.0.0.1:8080",
        "x-forwarded-host": "acme.example.com, proxy.internal",
      })
    ).toBeNull();
  });

  it("rejects a foreign origin", () => {
    expect(check("POST", { ...json, origin: "https://evil.example", host: "app.example.com" })).toBe(
      "untrusted_origin"
    );
  });

  it("rejects the opaque null origin", () => {
    expect(check("POST", { ...json, origin: "null", host: "app.example.com" })).toBe("untrusted_origin");
  });

  it("rejects a same-host origin on a different port", () => {
    expect(check("POST", { ...json, origin: "https://app.example.com:8443", host: "app.example.com" })).toBe(
      "untrusted_origin"
    );
  });

  it.each(["cross-site", "same-site"])("rejects Sec-Fetch-Site %s when Origin is missing", (site) => {
    expect(check("POST", { ...json, "sec-fetch-site": site })).toBe("cross_site_request");
  });

  it.each([
    {},
    { "sec-fetch-site": "same-origin" },
    { "sec-fetch-site": "none" },
  ])("accepts JSON requests without Origin (server-side callers) %o", (extra) => {
    expect(check("POST", { ...json, ...extra })).toBeNull();
  });
});

describe("buildTrustedOrigins", () => {
  it("normalizes URLs to origins and skips empty or malformed values", () => {
    expect(buildTrustedOrigins(["https://App.Example.com/path", undefined, "", "not a url"])).toEqual(
      new Set(["https://app.example.com"])
    );
  });
});
