import { getEnv } from "@/env";
import * as Sentry from "@sentry/nestjs";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

if (process.env.SENTRY_DSN) {
  // Ensure to call this before requiring any other modules!
  Sentry.init({
    dsn: getEnv("SENTRY_DSN"),
    integrations: [nodeProfilingIntegration(), Sentry.prismaIntegration()],
    // Performance Monitoring
    // Env values are strings at runtime, hence Number(); defaults capture 100% of the transactions
    tracesSampleRate: Number(getEnv("SENTRY_TRACES_SAMPLE_RATE", 1.0)),
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: Number(getEnv("SENTRY_PROFILES_SAMPLE_RATE", 1.0)),
  });
}
