import { recordAdminAction, recordAdminDenial } from "@calcom/features/audit-log/adminAuditLog";
import { getUserSession } from "@calcom/features/auth/lib/userFromSessionUtils";
import logger from "@calcom/lib/logger";
import { setUser as SentrySetUser } from "@sentry/nextjs";
import { TRPCError } from "@trpc/server";
import { middleware } from "../trpc";

export const isAuthed = middleware(async ({ ctx, next }) => {
  const middlewareStart = performance.now();

  const { user, session } = await getUserSession(ctx);

  const middlewareEnd = performance.now();
  logger.debug("Perf:t.isAuthed", middlewareEnd - middlewareStart);

  if (!user || !session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  SentrySetUser({ id: user.id });

  return next({
    ctx: { user, session },
  });
});

export const isAdminMiddleware = isAuthed.unstable_pipe(({ ctx, next, path }) => {
  const { user } = ctx;
  if (user?.role !== "ADMIN") {
    // SEC-305-FORK (Sprint 3): record attempted access to an admin-only path
    // even when it gets rejected, so the trail surfaces probing.
    if (user?.id) {
      recordAdminDenial({
        actorUserId: user.id,
        path,
        reason: "non-admin role attempted to call admin route",
      });
    }
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  // SEC-305-FORK (Sprint 3): record every admin-gated tRPC call. We only have
  // the procedure path here, not the input — by design, to keep the audit log
  // free of sensitive payloads. Handlers that mutate state should call
  // `recordAdminAction` themselves with relevant identifiers (target user id,
  // team id, feature slug, etc.).
  recordAdminAction({
    actorUserId: user.id,
    actorEmail: user.email,
    path,
    outcome: "granted",
  });
  return next({ ctx: { user: user } });
});

// Org admins can be admins or owners
export const isOrgAdminMiddleware = isAuthed.unstable_pipe(({ ctx, next }) => {
  const { user } = ctx;
  if (!user?.organization?.isOrgAdmin) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { user: user } });
});
