import dns from "node:dns/promises";
import process from "node:process";
import { IS_SELF_HOSTED } from "@calcom/lib/constants";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import logger from "@calcom/lib/logger";
import ipaddr from "ipaddr.js";

const log: ReturnType<typeof logger.getSubLogger> = logger.getSubLogger({ prefix: ["ssrf-protection"] });

/**
 * SSRF protection helpers for server-side URL fetching
 *
 * Use when fetching user-controlled URLs (logos, avatars, webhooks) to prevent
 * access to internal networks and cloud metadata services
 */

// Never reachable through user-controlled URLs, even on self-hosted instances and even when allowlisted
const ALWAYS_BLOCKED_IPV4_RANGES: ReadonlySet<string> = new Set([
  "unspecified", // 0.0.0.0/8
  "broadcast", // 255.255.255.255/32
  "multicast", // 224.0.0.0/4
  "linkLocal", // 169.254.0.0/16 (cloud metadata lives here)
  "loopback", // 127.0.0.0/8
  "reserved", // documentation, benchmarking (198.18.0.0/15), 240.0.0.0/4, ...
]);

const ALWAYS_BLOCKED_IPV6_RANGES: ReadonlySet<string> = new Set([
  "unspecified", // ::
  "linkLocal", // fe80::/10
  "multicast", // ff00::/8
  "loopback", // ::1
  "discard", // 100::/64
  "teredo", // 2001::/32, tunnels to an obfuscated IPv4 that is not decoded here
  "benchmarking",
  "deprecated",
  "orchid2",
  "reserved", // 2001:db8::/32, ...
]);

// Internal networks: blocked by default, can be opened with SSRF_ALLOWED_PRIVATE_HOSTS
const PRIVATE_IPV4_RANGES: ReadonlySet<string> = new Set([
  "private", // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  "carrierGradeNat", // 100.64.0.0/10 (RFC 6598)
]);

const PRIVATE_IPV6_RANGES: ReadonlySet<string> = new Set([
  "uniqueLocal", // fc00::/7
]);

// Deprecated site-local fec0::/10 is not classified by ipaddr.js but some networks still route it internally
const IPV6_SITE_LOCAL: [ipaddr.IPv6, number] = ipaddr.IPv6.parseCIDR("fec0::/10");
// RFC 8215 local-use NAT64 prefix, not classified by ipaddr.js
const IPV6_LOCAL_NAT64: [ipaddr.IPv6, number] = ipaddr.IPv6.parseCIDR("64:ff9b:1::/48");

// Metadata services, including those outside the always-blocked ranges, so an allowlist can never open them
const CLOUD_METADATA_IPS: ReadonlySet<string> = new Set([
  "169.254.169.254", // AWS/Azure/GCP/DigitalOcean/Oracle
  "169.254.169.253", // Azure alternate
  "169.254.170.2", // AWS ECS task metadata
  "100.100.100.200", // Alibaba Cloud (inside the CGNAT range)
  "192.0.0.192", // Oracle Cloud alternate
  "fd00:ec2::254", // AWS IMDS over IPv6 (inside fc00::/7)
]);

// Cloud metadata hostnames (blocked even on self-hosted)
const CLOUD_METADATA_ENDPOINTS: string[] = [
  "169.254.169.254",
  "169.254.169.253",
  "metadata",
  "metadata.google.internal",
  "metadata.google.com",
  "instance-data",
  "instance-data.ec2.internal",
];

const LOOPBACK_HOSTNAMES: string[] = ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"];

const BLOCKED_HOSTNAMES: string[] = [...CLOUD_METADATA_ENDPOINTS, ...LOOPBACK_HOSTNAMES];

const CAL_AVATAR_PATH_REGEX = /^\/api\/avatar\/.+\.png$/;

const ERRORS = {
  HTTPS_ONLY: "Only HTTPS URLs are allowed",
  INVALID_PROTOCOL: "Only HTTP and HTTPS protocols are allowed",
  PRIVATE_IP: "Private IP address",
  PRIVATE_IP_DNS: "Hostname resolves to private IP",
  DNS_FAILURE: "Hostname could not be resolved",
  BLOCKED_HOSTNAME: "Blocked hostname",
  INVALID_URL: "Invalid URL format",
  NON_IMAGE_DATA_URL: "Non-image data URL",
} as const;

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function stripIPv6Brackets(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function ipv4FromLow32Bits(ipv6: ipaddr.IPv6): ipaddr.IPv4 {
  return new ipaddr.IPv4(ipv6.toByteArray().slice(12, 16));
}

/**
 * IPv6 forms that carry an IPv4 destination are judged on that IPv4, otherwise
 * [::ffff:a9fe:a9fe] or [64:ff9b::a9fe:a9fe] would reach 169.254.169.254 as a "public" IPv6.
 */
function extractEmbeddedIPv4(ipv6: ipaddr.IPv6): ipaddr.IPv4 | null {
  const range = ipv6.range();
  if (range === "ipv4Mapped" || range === "rfc6145" || range === "rfc6052" || ipv6.match(IPV6_LOCAL_NAT64)) {
    return ipv4FromLow32Bits(ipv6);
  }
  if (range === "6to4") {
    return new ipaddr.IPv4(ipv6.toByteArray().slice(2, 6));
  }
  // Deprecated IPv4-compatible form ::a.b.c.d (:: and ::1 keep their own IPv6 meaning)
  const { parts } = ipv6;
  const isIPv4Compatible = parts.slice(0, 6).every((part) => part === 0) && (parts[6] !== 0 || parts[7] > 1);
  return isIPv4Compatible ? ipv4FromLow32Bits(ipv6) : null;
}

/** Parses any IP notation (decimal, octal, hex IPv4 included) and unwraps IPv6 addresses embedding an IPv4 */
function parseNormalizedIP(ip: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
  const cleanIp = stripIPv6Brackets(ip);
  if (!ipaddr.isValid(cleanIp)) return null;
  try {
    const addr = ipaddr.parse(cleanIp);
    if (addr.kind() === "ipv6") {
      return extractEmbeddedIPv4(addr as ipaddr.IPv6) ?? addr;
    }
    return addr;
  } catch {
    return null;
  }
}

export type IPClassification = "public" | "private" | "blocked";

/**
 * - blocked: loopback, link-local, unspecified, multicast/broadcast, reserved, cloud metadata. Never allowed.
 * - private: RFC 1918, CGNAT, IPv6 ULA/site-local. Allowed only through SSRF_ALLOWED_PRIVATE_HOSTS.
 * Unparseable input is classified as blocked so callers fail closed.
 */
export function classifyIP(ip: string): IPClassification {
  const addr = parseNormalizedIP(ip);
  if (!addr) return "blocked";

  if (CLOUD_METADATA_IPS.has(addr.toString()) || CLOUD_METADATA_IPS.has(addr.toNormalizedString())) {
    return "blocked";
  }

  const range = addr.range();
  if (addr.kind() === "ipv4") {
    if (ALWAYS_BLOCKED_IPV4_RANGES.has(range)) return "blocked";
    if (PRIVATE_IPV4_RANGES.has(range)) return "private";
    return "public";
  }

  if (ALWAYS_BLOCKED_IPV6_RANGES.has(range)) return "blocked";
  if (PRIVATE_IPV6_RANGES.has(range) || (addr as ipaddr.IPv6).match(IPV6_SITE_LOCAL)) return "private";
  return "public";
}

export function isPrivateIP(ip: string): boolean {
  return classifyIP(ip) !== "public";
}

interface PrivateNetworkAllowlist {
  hostnames: ReadonlySet<string>;
  ranges: ReadonlyArray<[ipaddr.IPv4 | ipaddr.IPv6, number]>;
}

let cachedAllowlist: { raw: string; parsed: PrivateNetworkAllowlist } | null = null;

/**
 * SSRF_ALLOWED_PRIVATE_HOSTS: comma-separated hostnames, IPs and/or CIDRs allowed to resolve to
 * private networks (e.g. an internal CalDAV or Exchange server). It never opens loopback,
 * link-local or metadata addresses.
 */
function getPrivateNetworkAllowlist(): PrivateNetworkAllowlist {
  const raw = process.env.SSRF_ALLOWED_PRIVATE_HOSTS ?? "";
  if (cachedAllowlist?.raw === raw) return cachedAllowlist.parsed;

  const hostnames = new Set<string>();
  const ranges: [ipaddr.IPv4 | ipaddr.IPv6, number][] = [];
  for (const entry of raw.split(",")) {
    const value = stripIPv6Brackets(normalizeHostname(entry.trim()));
    if (!value) continue;
    if (ipaddr.isValidCIDR(value)) {
      ranges.push(ipaddr.parseCIDR(value));
      continue;
    }
    const addr = parseNormalizedIP(value);
    if (addr) {
      ranges.push([addr, addr.kind() === "ipv4" ? 32 : 128]);
      continue;
    }
    hostnames.add(value);
  }

  const parsed = { hostnames, ranges };
  cachedAllowlist = { raw, parsed };
  return parsed;
}

function isInAllowedPrivateRange(ip: string): boolean {
  const addr = parseNormalizedIP(ip);
  if (!addr) return false;
  return getPrivateNetworkAllowlist().ranges.some(
    ([network, prefix]) => network.kind() === addr.kind() && addr.match(network, prefix)
  );
}

/** Whether `ip` may be contacted when reached through `hostname` (the IP itself for IP-literal URLs) */
export function isIPAllowedForHost(ip: string, hostname: string): boolean {
  const classification = classifyIP(ip);
  if (classification === "public") return true;
  if (classification === "blocked") return false;
  const host = stripIPv6Brackets(normalizeHostname(hostname));
  return getPrivateNetworkAllowlist().hostnames.has(host) || isInAllowedPrivateRange(ip);
}

// Check if hostname is a blocked cloud metadata endpoint or localhost
export function isBlockedHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return BLOCKED_HOSTNAMES.includes(normalized) || normalized.endsWith(".localhost");
}

// Check if hostname is a cloud metadata endpoint (blocked even on self-hosted)
function isCloudMetadataEndpoint(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return CLOUD_METADATA_ENDPOINTS.includes(normalized);
}

export interface SSRFValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Core validation logic shared by sync and async versions
 * Returns SSRFValidationResult if validation completes, or { url } if DNS check is needed
 */
function validateUrlCore(urlString: string): SSRFValidationResult | { url: URL } {
  // Data URLs with image/* are safe (no network fetch)
  if (urlString.startsWith("data:image/")) {
    return { isValid: true };
  }

  if (urlString.startsWith("data:")) {
    return { isValid: false, error: ERRORS.NON_IMAGE_DATA_URL };
  }

  if (CAL_AVATAR_PATH_REGEX.test(urlString)) {
    return { isValid: true };
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { isValid: false, error: ERRORS.INVALID_URL };
  }

  // E2E tests: allow localhost only
  if (process.env.NEXT_PUBLIC_IS_E2E === "1") {
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (isLocalhost) {
      return { isValid: true };
    }
  }

  if (isCloudMetadataEndpoint(url.hostname)) {
    return { isValid: false, error: ERRORS.BLOCKED_HOSTNAME };
  }

  // Self-hosted instances commonly post webhooks to plain-HTTP services; Cal.com SaaS requires HTTPS
  if (IS_SELF_HOSTED) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { isValid: false, error: ERRORS.INVALID_PROTOCOL };
    }
  } else if (url.protocol !== "https:") {
    return { isValid: false, error: ERRORS.HTTPS_ONLY };
  }

  if (isBlockedHostname(url.hostname)) {
    return { isValid: false, error: ERRORS.BLOCKED_HOSTNAME };
  }

  // The URL parser already canonicalizes decimal/octal/hex IPv4 hosts (0x7f.1, 2130706433) to dotted form
  const hostnameForIPCheck = stripIPv6Brackets(url.hostname);
  if (ipaddr.isValid(hostnameForIPCheck)) {
    return isIPAllowedForHost(hostnameForIPCheck, url.hostname)
      ? { isValid: true }
      : { isValid: false, error: ERRORS.PRIVATE_IP };
  }

  return { url };
}

/**
 * Async SSRF validation with DNS rebinding protection
 * Resolves every A and AAAA record of the hostname and rejects if any of them is not allowed
 */
export async function validateUrlForSSRF(urlString: string): Promise<SSRFValidationResult> {
  const result = validateUrlCore(urlString);

  if ("isValid" in result) {
    return result;
  }

  const { hostname } = result.url;
  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    // Fail closed: fetch() resolves through the same getaddrinfo call, so it would fail there too
    return { isValid: false, error: ERRORS.DNS_FAILURE };
  }

  if (addresses.length === 0) {
    return { isValid: false, error: ERRORS.DNS_FAILURE };
  }

  for (const { address } of addresses) {
    if (!isIPAllowedForHost(address, hostname)) {
      return { isValid: false, error: ERRORS.PRIVATE_IP_DNS };
    }
  }

  return { isValid: true };
}

/**
 * Sync SSRF validation for Zod schemas (no DNS check)
 * Does not protect against DNS rebinding - use async version when possible
 */
export function validateUrlForSSRFSync(urlString: string): SSRFValidationResult {
  const result = validateUrlCore(urlString);

  if ("isValid" in result) {
    return result;
  }

  return { isValid: true };
}

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_REDIRECTS = 5;

/**
 * Validates a user-controlled URL for SSRF and throws a generic error when blocked.
 * The specific reason is only logged, so callers never echo internal details to the client.
 */
export async function assertUrlIsSafeForSSRF(url: string, context?: Record<string, unknown>): Promise<void> {
  let isHttp = false;
  try {
    const { protocol } = new URL(url);
    isHttp = protocol === "http:" || protocol === "https:";
  } catch {
    isHttp = false;
  }
  // validateUrlForSSRF accepts data:image and relative avatar paths, which are never valid remote targets here
  const validation = isHttp
    ? await validateUrlForSSRF(url)
    : { isValid: false, error: ERRORS.INVALID_PROTOCOL };
  if (validation.isValid) return;

  logBlockedSSRFAttempt(url, validation.error ?? "unknown", context);
  throw new ErrorWithCode(ErrorCode.BadRequest, "URL is not allowed");
}

/**
 * fetch() for user-controlled URLs. Native fetch follows redirects without re-checking the target,
 * so a public URL could 302 to an internal address. Redirects are followed manually and every hop
 * (including the first) is re-validated, which also re-resolves DNS on each call.
 * Note: a residual TOCTOU window remains between our DNS lookup and the one done by fetch itself.
 */
export async function fetchWithSSRFProtection(
  url: string,
  init: RequestInit = {},
  options: { maxRedirects?: number } = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let currentUrl = url;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertUrlIsSafeForSSRF(currentUrl, { hop });

    const response = await fetch(currentUrl, { ...init, redirect: "manual" });
    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;

    await response.body?.cancel();
    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new ErrorWithCode(ErrorCode.BadRequest, `Too many redirects (max ${maxRedirects})`);
}

// Check if URL belongs to the same origin as the webapp (trusted internal URL)
export function isTrustedInternalUrl(url: string, webappUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(webappUrl).origin;
  } catch {
    return false;
  }
}

// Sanitize URL for logging - removes query params and credentials that may contain secrets
function sanitizeUrlForLog(urlString: string): string {
  try {
    const url = new URL(urlString);
    // Only log origin + pathname, exclude query params, hash, and credentials
    return `${url.origin}${url.pathname}`.substring(0, 100);
  } catch {
    // If URL parsing fails, truncate and redact potential secrets
    return `${urlString.substring(0, 50).replace(/[?#].*$/, "")}...`;
  }
}

// Log blocked SSRF attempts for security monitoring and incident response
export function logBlockedSSRFAttempt(url: string, reason: string, context?: Record<string, unknown>): void {
  log.warn("SSRF attempt blocked", {
    url: sanitizeUrlForLog(url),
    reason,
    ...context,
  });
}
