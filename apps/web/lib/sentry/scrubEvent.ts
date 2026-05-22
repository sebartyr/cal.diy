/**
 * RGPD-302: pure helper that scrubs PII out of a Sentry-shaped event.
 *
 * Kept in its own module (not inline in sentry.server.config.ts) so unit
 * tests can exercise it without booting Sentry. The shape mirrors the
 * Sentry `Event` interface — we use a structural type to avoid importing
 * the SDK in a hot module.
 */

const EMAIL_RE = /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

export const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "cookie",
  "x-cal-secret",
  "x-cal-signature-256",
  "x-cal-webhook-version",
  "x-vercel-id",
]);

export function redactEmails<T>(value: T): T {
  if (typeof value !== "string") return value;
  return value.replace(EMAIL_RE, "***@***") as unknown as T;
}

export type ScrubbableEvent = {
  message?: string | null;
  user?: { id?: string | number; email?: string; ip_address?: string; username?: string };
  tags?: Record<string, unknown>;
  request?: {
    data?: unknown;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
    query_string?: string | null;
    url?: string;
  };
  breadcrumbs?: Array<{ message?: string | null; data?: unknown }>;
};

export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  // Wipe user PII — keep id only.
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : {};
  }

  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADER_KEYS.has(key.toLowerCase())) {
          event.request.headers[key] = "[redacted]";
        }
      }
    }
    event.request.query_string = redactEmails(event.request.query_string);
    event.request.url = redactEmails(event.request.url);
  }

  event.message = redactEmails(event.message);

  if (Array.isArray(event.breadcrumbs)) {
    for (const bc of event.breadcrumbs) {
      bc.message = redactEmails(bc.message);
    }
  }

  return event;
}
