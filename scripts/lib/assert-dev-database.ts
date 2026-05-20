/**
 * Refuses to run a destructive dev helper unless the target database is a
 * local one. Used by scripts that overwrite user passwords, seed dummy admin
 * accounts, or otherwise mutate state in ways that would be catastrophic
 * against a hosted/production database.
 *
 * Allowlist is hostname-based (after URL parsing) rather than substring-based,
 * because the previous regex `/\b(prod|production)\b/` did not match common
 * hosted DB hostnames such as `*.clever-cloud.com` or `*.rds.amazonaws.com`.
 */

const DEV_HOSTNAME_ALLOWLIST = new Set<string>([
  "localhost",
  "127.0.0.1",
  "::1",
  // Common docker-compose service names for the dev stack.
  "db",
  "postgres",
  "postgresql",
]);

export type AssertDevDatabaseResult = { ok: true; hostname: string } | { ok: false; reason: string };

/**
 * Pure validator — returns a result instead of calling `process.exit`. Lets
 * tests exercise the rules without exiting the test runner.
 *
 * Hosted dev databases (e.g. Postgres add-on on Clever Cloud) are supported
 * via `ALLOW_DEV_DB_HOSTNAME`, which must match the hostname *exactly*. The
 * explicit copy/paste forces the operator to re-confirm every time they
 * switch between environments — a forgotten `.env` value won't silently
 * permit a different hosted hostname later.
 */
export function checkDevDatabase(env: NodeJS.ProcessEnv = process.env): AssertDevDatabaseResult {
  if (env.NODE_ENV === "production") {
    return { ok: false, reason: "NODE_ENV=production — refusing to run dev-only script" };
  }

  const url = env.DATABASE_URL;
  if (!url) {
    return { ok: false, reason: "DATABASE_URL is not set" };
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return { ok: false, reason: `DATABASE_URL is not a valid URL: ${url.slice(0, 60)}…` };
  }

  // URL parser keeps IPv6 hosts wrapped in brackets — strip them so the
  // allowlist match (`::1`) works as expected.
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }

  if (DEV_HOSTNAME_ALLOWLIST.has(hostname)) {
    return { ok: true, hostname };
  }

  // Escape hatch for a hosted dev DB (e.g. a Postgres add-on used as a
  // playground). The env var must match the hostname literally — there is
  // no wildcard, on purpose. Switching DBs requires updating the var.
  const allowed = env.ALLOW_DEV_DB_HOSTNAME;
  if (allowed && allowed === hostname) {
    return { ok: true, hostname };
  }

  return {
    ok: false,
    reason:
      `DATABASE_URL hostname "${hostname}" is not in the dev allowlist. ` +
      `Allowed: ${[...DEV_HOSTNAME_ALLOWLIST].join(", ")}. ` +
      `To target a hosted dev DB, set ALLOW_DEV_DB_HOSTNAME="${hostname}" (literal match).`,
  };
}

/**
 * Caller convenience — prints the reason on refusal and exits with code 1.
 * Returns the parsed hostname when allowed so the caller can log it.
 */
export function assertDevDatabase(): string {
  const result = checkDevDatabase();
  if (!result.ok) {
    console.error(`REFUSED: ${result.reason}`);
    console.error(
      "This script must only run against a local dev database. " +
        "Point DATABASE_URL at localhost or a docker-compose Postgres."
    );
    process.exit(1);
  }
  return result.hostname;
}
