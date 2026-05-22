// SEC-305-FORK (Sprint 3): structured audit trail for administrator-scope
// tRPC calls. We don't yet have a persistent audit store — this module just
// emits a well-defined JSON-shaped log line so ops can route it to their
// SIEM/log aggregator without further code changes. When we get a real audit
// store, this module is the one place that needs to change.

import logger from "@calcom/lib/logger";

export interface AdminAuditEvent {
  actorUserId: number;
  actorEmail?: string | null;
  // tRPC path, e.g. "viewer.admin.lockUserAccount"
  path: string;
  // Whether the action ultimately succeeded ("granted") or was rejected by
  // an inner check after passing the admin gate ("denied"). We only emit
  // "granted" from the middleware itself; downstream code can emit "denied"
  // explicitly via `recordAdminDenial`.
  outcome: "granted" | "denied";
  // Optional structured context. Should be small and PII-light. Sensitive
  // fields (passwords, secret keys, full emails of targets) must NOT be
  // forwarded — pass identifiers instead.
  context?: Record<string, unknown>;
  // Optional reason string for denials.
  reason?: string;
}

const auditLogger = logger.getSubLogger({ prefix: ["admin-audit"] });

export function recordAdminAction(event: AdminAuditEvent): void {
  // We intentionally use a fixed message so the log line is greppable, and
  // pack everything else under a single object so structured-log shippers
  // serialize it as one record.
  auditLogger.info("admin-action", {
    actorUserId: event.actorUserId,
    actorEmail: event.actorEmail ?? undefined,
    path: event.path,
    outcome: event.outcome,
    context: event.context,
    reason: event.reason,
    at: new Date().toISOString(),
  });
}

export function recordAdminDenial(args: {
  actorUserId: number;
  path: string;
  reason: string;
  context?: Record<string, unknown>;
}): void {
  recordAdminAction({
    actorUserId: args.actorUserId,
    path: args.path,
    outcome: "denied",
    reason: args.reason,
    context: args.context,
  });
}
