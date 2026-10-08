import type { IncomingHttpHeaders } from "node:http";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const firstValue = (value: string | string[] | undefined): string | undefined => {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",")[0]?.trim().toLowerCase() || undefined;
};

const parseHost = (origin: string): string | null => {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
};

export type CsrfRejectionReason = "unsupported_content_type" | "untrusted_origin" | "cross_site_request";

/**
 * The session cookie is `SameSite=None` in production so booking pages keep the
 * user's session inside third-party embeds, which means browsers attach it to
 * cross-site requests. tRPC would otherwise accept a `text/plain` POST (a "simple"
 * request that skips the CORS preflight), so a malicious page could fire mutations
 * with the victim's session. Requiring a JSON content type forces a preflight that
 * we never answer, and the Origin / Sec-Fetch-Site checks reject anything that
 * still gets through. Our own clients always call `/api/trpc` with a relative URL,
 * so legitimate requests (including those made from inside embed iframes or on
 * organization subdomains) are always same-origin.
 */
export function getCsrfRejectionReason({
  method,
  headers,
  trustedOrigins,
}: {
  method: string | undefined;
  headers: IncomingHttpHeaders;
  trustedOrigins: ReadonlySet<string>;
}): CsrfRejectionReason | null {
  if (!method || SAFE_METHODS.has(method.toUpperCase())) return null;

  const contentType = firstValue(headers["content-type"])?.split(";")[0]?.trim();
  if (contentType !== "application/json") return "unsupported_content_type";

  const origin = firstValue(headers.origin);
  if (origin) {
    if (trustedOrigins.has(origin)) return null;
    const originHost = parseHost(origin);
    const requestHosts = [firstValue(headers["x-forwarded-host"]), firstValue(headers.host)];
    if (originHost && requestHosts.includes(originHost)) return null;
    return "untrusted_origin";
  }

  // Requests without Origin come from server-side callers or tooling; browsers always
  // send Origin on cross-origin POSTs, Sec-Fetch-Site is a fallback for odd cases.
  const fetchSite = firstValue(headers["sec-fetch-site"]);
  if (fetchSite === "cross-site" || fetchSite === "same-site") return "cross_site_request";

  return null;
}

export const buildTrustedOrigins = (urls: Array<string | undefined>): Set<string> => {
  const origins = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    try {
      origins.add(new URL(url).origin.toLowerCase());
    } catch {
      // Ignore malformed env values rather than failing every request.
    }
  }
  return origins;
};
