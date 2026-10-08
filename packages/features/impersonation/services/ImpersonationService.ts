import process from "node:process";
import { recordAdminAction, recordAdminDenial } from "@calcom/features/audit-log/adminAuditLog";
import type { ImpersonationRepository } from "@calcom/features/impersonation/repositories/ImpersonationRepository";
import type { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { UserPermissionRole } from "@calcom/prisma/enums";

export const IMPERSONATION_START_AUDIT_PATH = "auth.impersonation.start";
export const IMPERSONATION_STOP_AUDIT_PATH = "auth.impersonation.stop";

export interface IImpersonationServiceDeps {
  userRepository: UserRepository;
  impersonationRepository: ImpersonationRepository;
}

export type ImpersonationActor = {
  userId: number;
  // Role carried by the current session token. It differs from the database role when an
  // admin logged in without meeting the admin security requirements ("INACTIVE_ADMIN").
  sessionRole: string | null | undefined;
  impersonatedById: number | null;
};

export type ImpersonationIdentity = NonNullable<Awaited<ReturnType<UserRepository["findAuthIdentityById"]>>>;

export type ImpersonatedBy = {
  id: number;
  uuid: string;
  role: UserPermissionRole;
};

export class ImpersonationService {
  constructor(private readonly deps: IImpersonationServiceDeps) {}

  async startImpersonation({
    actor,
    usernameOrEmail,
  }: {
    actor: ImpersonationActor | null;
    usernameOrEmail: string;
  }): Promise<{ user: ImpersonationIdentity; impersonatedBy: ImpersonatedBy }> {
    if (!actor) {
      throw new ErrorWithCode(ErrorCode.Unauthorized, "You must be signed in to impersonate a user.");
    }

    const actorUserId = actor.userId;
    if (actor.impersonatedById !== null) {
      this.denyStart(actorUserId, "Cannot impersonate from an already impersonated session.");
    }

    if (actor.sessionRole !== UserPermissionRole.ADMIN) {
      this.denyStart(actorUserId, "Only administrators can impersonate users.");
    }

    const admin = await this.deps.userRepository.findAuthIdentityById({ id: actor.userId });
    if (!admin || admin.locked || admin.role !== UserPermissionRole.ADMIN) {
      this.denyStart(actorUserId, "Only administrators can impersonate users.");
    }
    if (process.env.REQUIRE_2FA_FOR_ADMIN === "true" && !admin.twoFactorEnabled) {
      this.denyStart(actorUserId, "Two-factor authentication is required for administrator accounts.");
    }

    const identifier = usernameOrEmail.trim().toLowerCase();
    if (!identifier) {
      this.denyStart(actorUserId, "A username or email is required.", ErrorCode.BadRequest);
    }

    const target = await this.deps.userRepository.findAuthIdentityByUsernameOrEmail({
      usernameOrEmail: identifier,
    });
    if (!target) {
      this.denyStart(actorUserId, "This user does not exist.", ErrorCode.NotFound);
    }
    if (target.id === admin.id) {
      this.denyStart(actorUserId, "You cannot impersonate yourself.", ErrorCode.BadRequest);
    }
    if (target.locked) {
      this.denyStart(actorUserId, "Locked users cannot be impersonated.");
    }
    if (target.role === UserPermissionRole.ADMIN) {
      this.denyStart(actorUserId, "Administrators cannot be impersonated.");
    }

    await this.deps.impersonationRepository.create({
      impersonatedUserId: target.id,
      impersonatedById: admin.id,
    });

    recordAdminAction({
      actorUserId: admin.id,
      actorEmail: admin.email,
      path: IMPERSONATION_START_AUDIT_PATH,
      outcome: "granted",
      context: { targetUserId: target.id },
    });

    return {
      user: target,
      impersonatedBy: { id: admin.id, uuid: admin.uuid, role: admin.role },
    };
  }

  private denyStart(actorUserId: number, reason: string, code: ErrorCode = ErrorCode.Forbidden): never {
    recordAdminDenial({ actorUserId, path: IMPERSONATION_START_AUDIT_PATH, reason });
    throw new ErrorWithCode(code, reason);
  }

  async stopImpersonation({
    actor,
    returnToId,
  }: {
    actor: ImpersonationActor | null;
    returnToId: number;
  }): Promise<{ user: ImpersonationIdentity }> {
    if (!actor || actor.impersonatedById === null) {
      throw new ErrorWithCode(ErrorCode.Unauthorized, "There is no impersonation session to stop.");
    }
    // Only the admin recorded in the signed session token can be returned to, otherwise
    // any impersonated session could be used to take over an arbitrary account.
    if (actor.impersonatedById !== returnToId) {
      recordAdminDenial({
        actorUserId: actor.impersonatedById,
        path: IMPERSONATION_STOP_AUDIT_PATH,
        reason: "returnToId does not match the impersonating administrator",
        context: { impersonatedUserId: actor.userId, returnToId },
      });
      throw new ErrorWithCode(ErrorCode.Forbidden, "You can only return to your own account.");
    }

    const admin = await this.deps.userRepository.findAuthIdentityById({ id: returnToId });
    if (!admin || admin.locked) {
      throw new ErrorWithCode(ErrorCode.Forbidden, "The impersonating account is no longer available.");
    }

    recordAdminAction({
      actorUserId: admin.id,
      actorEmail: admin.email,
      path: IMPERSONATION_STOP_AUDIT_PATH,
      outcome: "granted",
      context: { impersonatedUserId: actor.userId },
    });

    return { user: admin };
  }
}
