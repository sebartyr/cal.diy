/**
 * Required environment variables for a production runtime. Missing or
 * placeholder values cause the boot to fail (see instrumentation.ts).
 *
 * Pure module — no Next.js or Sentry imports — so it can be unit-tested
 * cheaply.
 */

const REQUIRED_VARS = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "CALENDSO_ENCRYPTION_KEY",
  "UNKEY_ROOT_KEY",
] as const;

const PLACEHOLDER_VALUES = new Set(["secret", "changeme", "change-me", "TODO"]);

export type AssertProductionEnvResult =
  | { ok: true }
  | { ok: false; missing: string[]; placeholders: string[] };

/**
 * Pure check — returns a structured result. Caller decides whether to
 * `throw` (production) or just `log` (tests).
 */
export function checkProductionEnv(
  env: Record<string, string | undefined>
): AssertProductionEnvResult {
  // Skip the check whenever we're not in a production runtime; the dev
  // server, vitest, and Next's edge runtime each have their own guarantees.
  if (env.NODE_ENV !== "production") return { ok: true };
  if (env.NEXT_RUNTIME && env.NEXT_RUNTIME !== "nodejs") return { ok: true };

  const missing: string[] = [];
  const placeholders: string[] = [];

  for (const key of REQUIRED_VARS) {
    const value = env[key];
    if (!value) {
      missing.push(key);
      continue;
    }
    if (PLACEHOLDER_VALUES.has(value)) {
      placeholders.push(key);
    }
  }

  // Extra rule: CALENDSO_ENCRYPTION_KEY must be long enough to be
  // plausibly a random key (24+ chars). Catches casual reuse of short
  // values that happen to slip past the placeholder set above.
  const encKey = env.CALENDSO_ENCRYPTION_KEY;
  if (encKey && !PLACEHOLDER_VALUES.has(encKey) && encKey.length < 24) {
    placeholders.push("CALENDSO_ENCRYPTION_KEY(too-short)");
  }

  if (missing.length === 0 && placeholders.length === 0) return { ok: true };
  return { ok: false, missing, placeholders };
}

export function formatAssertProductionEnvError(result: { missing: string[]; placeholders: string[] }) {
  const parts: string[] = [];
  if (result.missing.length) parts.push(`missing: ${result.missing.join(", ")}`);
  if (result.placeholders.length) parts.push(`placeholder/insecure: ${result.placeholders.join(", ")}`);
  return (
    `Refusing to boot in production. Fix the env vars first: ${parts.join(" | ")}. ` +
    `See audit/OPS_TODO.md.`
  );
}
