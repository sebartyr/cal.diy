import { recordAdminAction, recordAdminDenial } from "@calcom/features/audit-log/adminAuditLog";
import { getSystemAdminDenialReason } from "@calcom/features/auth/lib/systemAdminPolicy";
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

const IMPERSONATION_BLOCKED_MESSAGE = "This action is not allowed while impersonating a user.";

// Account-takeover sensitive procedures (credentials, 2FA, API keys, linked identities, account
// deletion...) and admin procedures must be performed by the account owner, never by an admin
// acting through an impersonated session.
export const isNotImpersonatingMiddleware = isAuthed.unstable_pipe(({ ctx, next, path }) => {
  const impersonatedBy = ctx.session.user.impersonatedBy;
  if (impersonatedBy) {
    recordAdminDenial({
      actorUserId: impersonatedBy.id,
      path,
      reason: "sensitive procedure blocked during impersonation",
      context: { impersonatedUserId: ctx.user.id },
    });
    throw new TRPCError({ code: "FORBIDDEN", message: IMPERSONATION_BLOCKED_MESSAGE });
  }
  return next();
});

// SPRINT3-041: REQUIRE_2FA_FOR_ADMIN is an opt-in flag enforcing 2FA on admin powers. We don't flip
// it on by default to give existing admins time to enroll; ops sets it via env once every admin has
// TOTP configured. RGPD §9 / common audit requirement. The policy lives in getSystemAdminDenialReason
// so that admin routes, impersonation and admin extensions of regular features stay aligned.
export const isAdminMiddleware = isAuthed.unstable_pipe(({ ctx, next, path }) => {
  const { user } = ctx;
  const impersonatedBy = ctx.session.user.impersonatedBy;
  if (impersonatedBy) {
    recordAdminDenial({
      actorUserId: impersonatedBy.id,
      path,
      reason: "admin route blocked during impersonation",
      context: { impersonatedUserId: user.id },
    });
    throw new TRPCError({ code: "FORBIDDEN", message: IMPERSONATION_BLOCKED_MESSAGE });
  }
  const denialReason = getSystemAdminDenialReason(user);
  if (denialReason === "not_admin" || denialReason === "locked") {
    // SEC-305-FORK (Sprint 3): record attempted access to an admin-only path
    // even when it gets rejected, so the trail surfaces probing.
    if (user?.id) {
      recordAdminDenial({
        actorUserId: user.id,
        path,
        reason: "non-admin role attempted to call admin route",
      });
    }
    // ctx.user.role is capped by the role validated at login (see getEffectivePermissionRole), so
    // an account promoted in the database since then lands here until it signs in again.
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  if (denialReason === "two_factor_required") {
    recordAdminDenial({
      actorUserId: user.id,
      path,
      reason: "admin without 2FA enrolled blocked by REQUIRE_2FA_FOR_ADMIN",
    });
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Two-factor authentication is required for administrator accounts.",
    });
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
