/**
 * Analytics apps inject scripts on the public booking page, on the Cal.diy origin. Their template
 * values come from event type metadata, which any event type owner controls, so a syntactically
 * valid URL is not enough: the code that ends up running must come from a source the deployment
 * trusts. This module holds that deployment-side policy.
 */

type AnalyticsAppPolicy = {
  /** Vendor-hosted origins accepted without any configuration. `https://*.example.com` matches subdomains. */
  defaultOrigins: string[];
  /** Stricter formats for ID-like variables, on top of the generic safe-character check. */
  idPatterns?: Record<string, RegExp>;
  /** The app lets the tenant run arbitrary JS even with a valid ID, so the deployment must opt in. */
  requiresGtmOptIn?: boolean;
};

export const ANALYTICS_APP_POLICIES: Record<string, AnalyticsAppPolicy> = {
  // gtag.js also serves full GTM containers when given a GTM- ID, so only measurement IDs are accepted.
  ga4: {
    defaultOrigins: ["https://www.googletagmanager.com"],
    idPatterns: { TRACKING_ID: /^G-[A-Z0-9]+$/i },
  },
  // Custom HTML tags in a GTM container run arbitrary JS chosen by whoever owns the container.
  gtm: {
    defaultOrigins: [],
    idPatterns: { TRACKING_ID: /^GTM-[A-Z0-9]+$/i },
    requiresGtmOptIn: true,
  },
  fathom: {
    defaultOrigins: ["https://cdn.usefathom.com"],
    idPatterns: { TRACKING_ID: /^[A-Z0-9]+$/i },
  },
  metapixel: {
    defaultOrigins: [],
    idPatterns: {
      TRACKING_ID: /^\d+$/,
      TRACKING_EVENT: /^(Lead|CompleteRegistration|Schedule|PageView)$/,
    },
  },
  insihts: { defaultOrigins: ["https://collector.insihts.com"] },
  twipla: { defaultOrigins: [] },
  umami: { defaultOrigins: ["https://cloud.umami.is"] },
  plausible: { defaultOrigins: ["https://plausible.io"] },
  matomo: { defaultOrigins: ["https://*.matomo.cloud", "https://*.innocraft.cloud"] },
  posthog: { defaultOrigins: ["https://*.posthog.com"] },
  databuddy: { defaultOrigins: ["https://cdn.databuddy.cc", "https://basket.databuddy.cc"] },
};

export const isUrlTemplateVariable = (variableName: string): boolean =>
  variableName.endsWith("_URL") || variableName === "API_HOST";

// Read at call time with literal property access on the global `process` so Next.js inlines
// NEXT_PUBLIC_ values in the client bundle (an imported `process` binding is not replaced) while
// tests can still stub them.
function getDeploymentAllowedOrigins(): string[] {
  // biome-ignore lint/correctness/noProcessGlobal: see above
  return (process.env.NEXT_PUBLIC_ANALYTICS_ALLOWED_SCRIPT_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isGtmAllowedByDeployment(): boolean {
  // biome-ignore lint/correctness/noProcessGlobal: inlined by Next.js, see getDeploymentAllowedOrigins
  return process.env.NEXT_PUBLIC_ANALYTICS_ALLOW_GTM === "true";
}

function matchesOriginPattern(url: URL, pattern: string): boolean {
  const wildcardPrefix = "https://*.";
  if (pattern.toLowerCase().startsWith(wildcardPrefix)) {
    const suffix = `.${pattern.slice(wildcardPrefix.length).toLowerCase()}`;
    return url.host.endsWith(suffix) && url.host.length > suffix.length;
  }
  try {
    const allowed = new URL(pattern);
    if (allowed.protocol !== "https:") return false;
    return allowed.origin === url.origin;
  } catch {
    return false;
  }
}

export function isAllowedScriptUrl(appId: string, value: string): boolean {
  const policy = ANALYTICS_APP_POLICIES[appId];
  if (!policy) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const patterns = [...policy.defaultOrigins, ...getDeploymentAllowedOrigins()];
  return patterns.some((pattern) => matchesOriginPattern(url, pattern));
}

/**
 * Returns whether the app may be injected at all given its referenced template values and the
 * resolved `src` of each of its scripts. Apps without an explicit policy are never injected so
 * a newly added analytics app cannot bypass review.
 */
export function isAnalyticsAppAllowed({
  appId,
  referencedValues,
  resolvedScriptSrcs,
}: {
  appId: string;
  referencedValues: Record<string, unknown>;
  resolvedScriptSrcs: string[];
}): boolean {
  const policy = ANALYTICS_APP_POLICIES[appId];
  if (!policy) return false;
  if (policy.requiresGtmOptIn && !isGtmAllowedByDeployment()) return false;

  for (const [variableName, value] of Object.entries(referencedValues)) {
    if (!value) continue;
    const stringValue = String(value);
    if (isUrlTemplateVariable(variableName)) {
      if (!isAllowedScriptUrl(appId, stringValue)) return false;
      continue;
    }
    const pattern = policy.idPatterns?.[variableName];
    if (pattern && !pattern.test(stringValue)) return false;
  }

  return resolvedScriptSrcs.every((src) => isAllowedScriptUrl(appId, src));
}
