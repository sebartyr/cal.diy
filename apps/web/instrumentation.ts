import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

import { checkProductionEnv, formatAssertProductionEnvError } from "./lib/env/assertProductionEnv";

/**
 * Fail-fast at boot if a production deployment is missing required secrets
 * or still carries the Dockerfile "secret" placeholder. Without this, a
 * publicly-exposed instance could sign JWTs with the literal "secret"
 * string and run with rate-limiting fully disabled (see SEC-200, SEC-204).
 */
function assertProductionEnv() {
  const result = checkProductionEnv(process.env);
  if (!result.ok) {
    throw new Error(formatAssertProductionEnvError(result));
  }
}

export async function register() {
  assertProductionEnv();

  if (process.env.NODE_ENV === "production") {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NEXT_RUNTIME === "nodejs") {
      await import("./sentry.server.config");
    }
    if (process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NEXT_RUNTIME === "edge") {
      await import("./sentry.edge.config");
    }
  }
}

export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  if (process.env.NODE_ENV === "production") {
    Sentry.captureRequestError(err, request, context);
  }
};
