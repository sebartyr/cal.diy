import { describe, expect, it } from "vitest";
import { getSecondaryHostnameRedirectUrl, parseSecondaryHostnames } from "./secondaryHostnames";

const canonicalUrl = "https://cal.example.com";

describe("parseSecondaryHostnames", () => {
  it("returns an empty set when the variable is unset or blank", () => {
    expect(parseSecondaryHostnames(undefined).size).toBe(0);
    expect(parseSecondaryHostnames("").size).toBe(0);
    expect(parseSecondaryHostnames(" , ").size).toBe(0);
  });

  it("trims, lowercases and deduplicates entries", () => {
    expect(Array.from(parseSecondaryHostnames(" RDV.example.com, cal.example.org ,rdv.example.com"))).toEqual(
      ["rdv.example.com", "cal.example.org"]
    );
  });
});

describe("getSecondaryHostnameRedirectUrl", () => {
  const secondaryHostnames = parseSecondaryHostnames("rdv.example.com,cal.example.org");

  it("redirects an alias to the canonical origin, keeping path and query", () => {
    const target = getSecondaryHostnameRedirectUrl({
      url: new URL("https://rdv.example.com/team/sales?month=2026-10&date=2026-10-05"),
      host: "rdv.example.com",
      secondaryHostnames,
      canonicalUrl,
    });
    expect(target?.toString()).toBe("https://cal.example.com/team/sales?month=2026-10&date=2026-10-05");
  });

  it("matches the host case-insensitively and ignores its port", () => {
    const target = getSecondaryHostnameRedirectUrl({
      url: new URL("http://cal.example.org:8080/auth/login"),
      host: "Cal.Example.org:8080",
      secondaryHostnames,
      canonicalUrl,
    });
    expect(target?.toString()).toBe("https://cal.example.com/auth/login");
  });

  it("keeps the canonical URL's port", () => {
    const target = getSecondaryHostnameRedirectUrl({
      url: new URL("http://rdv.example.com/"),
      host: "rdv.example.com",
      secondaryHostnames,
      canonicalUrl: "http://localhost:3000",
    });
    expect(target?.toString()).toBe("http://localhost:3000/");
  });

  it("does not redirect the canonical host or unknown hosts", () => {
    for (const host of ["cal.example.com", "evil.example.net"]) {
      expect(
        getSecondaryHostnameRedirectUrl({
          url: new URL(`https://${host}/`),
          host,
          secondaryHostnames,
          canonicalUrl,
        })
      ).toBeNull();
    }
  });

  it("does nothing without a host header or configured aliases", () => {
    const url = new URL("https://rdv.example.com/");
    expect(getSecondaryHostnameRedirectUrl({ url, host: null, secondaryHostnames, canonicalUrl })).toBeNull();
    expect(
      getSecondaryHostnameRedirectUrl({
        url,
        host: "rdv.example.com",
        secondaryHostnames: new Set(),
        canonicalUrl,
      })
    ).toBeNull();
  });

  it("refuses to redirect when the canonical host is listed as an alias, to avoid a loop", () => {
    expect(
      getSecondaryHostnameRedirectUrl({
        url: new URL("https://cal.example.com/"),
        host: "cal.example.com",
        secondaryHostnames: parseSecondaryHostnames("cal.example.com"),
        canonicalUrl,
      })
    ).toBeNull();
  });
});
