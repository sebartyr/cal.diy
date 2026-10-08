import process from "node:process";
import { UserPermissionRole } from "@calcom/prisma/enums";

export type SystemAdminCandidate = {
  role: string | null | undefined;
  // Required key so that every caller has to provide it: when the 2FA policy is on, a missing value
  // denies the admin powers.
  twoFactorEnabled: boolean | null | undefined;
  locked?: boolean | null;
};

export type SystemAdminDenialReason = "not_admin" | "locked" | "two_factor_required";

/** Read at call time so that ops can flip it without the value being frozen at module load. */
export function isTwoFactorRequiredForAdmins(): boolean {
  return process.env.REQUIRE_2FA_FOR_ADMIN === "true";
}

/**
 * The single policy every instance-wide admin power goes through: admin routes, impersonation, and
 * the admin extensions of regular features (e.g. acting on other users' bookings).
 *
 * `role` must be the effective role (see `getEffectivePermissionRole`) when it comes from a session,
 * or the database role when re-checking an account. Impersonation is a property of the session and
 * is checked by the callers that have one (`isActingSystemAdmin`, the impersonation middlewares).
 */
export function getSystemAdminDenialReason(user: SystemAdminCandidate): SystemAdminDenialReason | null {
  if (user.role !== UserPermissionRole.ADMIN) return "not_admin";
  if (user.locked) return "locked";
  if (isTwoFactorRequiredForAdmins() && !user.twoFactorEnabled) return "two_factor_required";
  return null;
}

export function meetsSystemAdminPolicy(user: SystemAdminCandidate): boolean {
  return getSystemAdminDenialReason(user) === null;
}
