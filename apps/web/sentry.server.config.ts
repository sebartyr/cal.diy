//biome-ignore-all lint/style/noProcessEnv: Server side
//biome-ignore-all lint/correctness/noProcessGlobal: Server side

// This file configures the initialization of Sentry on the server.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from "@sentry/nextjs";

import { scrubEvent } from "./lib/sentry/scrubEvent";

/**
 * RGPD-302 (SPRINT2-031): scrub PII before events reach Sentry.
 *
 * Scrub logic lives in `lib/sentry/scrubEvent.ts` so it's unit-testable
 * without booting Sentry. We strip request bodies, cookies, sensitive
 * headers (Authorization, X-Cal-Signature-*), redact email-shaped strings
 * from URLs/messages/breadcrumbs, and reduce `user` to its id.
 *
 * The `prismaIntegration` / `httpIntegration` calls aren't present in the
 * `@sentry/nextjs` edge build (Next 16 + current SDK version mismatch —
 * tracked in OPS_TODO). Gate them so the edge bundle stops failing to
 * load.
 */

const isNodeRuntime = process.env.NEXT_RUNTIME === "nodejs" || typeof process.env.NEXT_RUNTIME === "undefined";

// biome-ignore lint/suspicious/noExplicitAny: edge build lacks these factory functions on the type
const SentryNode = Sentry as any;
const integrations = isNodeRuntime
  ? [
      typeof SentryNode.prismaIntegration === "function" ? SentryNode.prismaIntegration() : null,
      typeof SentryNode.httpIntegration === "function" ? SentryNode.httpIntegration() : null,
    ].filter(Boolean)
  : [];

Sentry.init({
  debug: !!process.env.SENTRY_DEBUG,
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  sampleRate: parseFloat(process.env.SENTRY_SAMPLE_RATE ?? "1.0") || 1.0,
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.0") || 0.0,
  integrations,
  sendDefaultPii: false,
  beforeSend(event) {
    event.tags = { ...event.tags, errorSource: "server" };
    // scrubEvent uses a structural ScrubbableEvent shape that intentionally
    // omits Sentry-internal fields. The mutation is in-place, so the runtime
    // return is the same ErrorEvent — we just have to reassert the type.
    return scrubEvent(event as unknown as Parameters<typeof scrubEvent>[0]) as typeof event;
  },
});
