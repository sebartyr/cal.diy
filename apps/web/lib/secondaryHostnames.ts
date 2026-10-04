export const parseSecondaryHostnames = (value: string | undefined): Set<string> => {
  const hostnames = new Set<string>();
  if (!value) return hostnames;

  for (const entry of value.split(",")) {
    const hostname = entry.trim().toLowerCase();
    if (hostname) hostnames.add(hostname);
  }
  return hostnames;
};

const stripPort = (host: string) => host.replace(/:\d+$/, "");

/**
 * Aliases are redirected rather than served because the canonical URL is baked
 * into the client bundle and drives NextAuth cookies, OIDC redirect URIs and CSP.
 */
export const getSecondaryHostnameRedirectUrl = ({
  url,
  host,
  secondaryHostnames,
  canonicalUrl,
}: {
  url: URL;
  host: string | null;
  secondaryHostnames: Set<string>;
  canonicalUrl: string;
}): URL | null => {
  if (!host || secondaryHostnames.size === 0) return null;
  if (!secondaryHostnames.has(stripPort(host.trim().toLowerCase()))) return null;

  const target = new URL(canonicalUrl);
  // Guards against a misconfiguration listing the canonical host as an alias, which would loop.
  if (secondaryHostnames.has(target.hostname.toLowerCase())) return null;

  target.pathname = url.pathname;
  target.search = url.search;
  return target;
};
