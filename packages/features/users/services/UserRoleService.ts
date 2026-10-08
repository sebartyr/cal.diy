import { recordAdminAction, recordAdminDenial } from "@calcom/features/audit-log/adminAuditLog";
import type {
  UserPermissionRoleDto,
  UserRoleRepository,
} from "@calcom/features/users/repositories/UserRoleRepository";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";

export const SET_USER_ROLE_AUDIT_PATH = "viewer.admin.setUserRole";

export interface IUserRoleServiceDeps {
  userRoleRepository: UserRoleRepository;
}

export type SetUserRoleInput = {
  actor: { id: number; email?: string | null };
  targetUserId: number;
  role: UserPermissionRoleDto;
};

export type SetUserRoleResult = {
  userId: number;
  from: UserPermissionRoleDto;
  to: UserPermissionRoleDto;
  changed: boolean;
};

export class UserRoleService {
  constructor(private readonly deps: IUserRoleServiceDeps) {}

  /**
   * Reads the role straight from the database so that server-side admin gates do not depend on the
   * session (cached in memory per process) or the JWT (which keeps the role it was issued with).
   */
  async isActiveSystemAdmin(userId: number): Promise<boolean> {
    const user = await this.deps.userRoleRepository.findById({ id: userId });
    return user?.role === "ADMIN" && !user.locked;
  }

  async setUserRole({ actor, targetUserId, role }: SetUserRoleInput): Promise<SetUserRoleResult> {
    // Changing one's own role is blocked outright: self-promotion is meaningless for an admin, and
    // self-demotion is the easiest way to lock everyone out of the admin panel by mistake.
    if (actor.id === targetUserId) {
      this.deny(actor, targetUserId, role, "admin attempted to change their own role");
      throw new ErrorWithCode(ErrorCode.Forbidden, "You cannot change your own role.");
    }

    const result = await this.deps.userRoleRepository.withSerializableTransaction(async (repository) => {
      const target = await repository.findById({ id: targetUserId });
      if (!target) {
        throw new ErrorWithCode(ErrorCode.NotFound, `User ${targetUserId} not found.`);
      }

      if (target.locked) {
        this.deny(actor, targetUserId, role, "target user account is locked");
        throw new ErrorWithCode(
          ErrorCode.BadRequest,
          "Cannot change the role of a locked user. Unlock the account first."
        );
      }

      if (target.role === role) {
        return { userId: target.id, from: target.role, to: role, changed: false };
      }

      if (target.role === "ADMIN") {
        const adminCount = await repository.countByRole({ role: "ADMIN" });
        if (adminCount <= 1) {
          this.deny(actor, targetUserId, role, "refused to demote the last remaining admin");
          throw new ErrorWithCode(ErrorCode.BadRequest, "Cannot remove the role of the last administrator.");
        }
      }

      const from = target.role;
      await repository.updateRole({ id: target.id, role });
      return { userId: target.id, from, to: role, changed: true };
    });

    if (result.changed) {
      recordAdminAction({
        actorUserId: actor.id,
        actorEmail: actor.email,
        path: SET_USER_ROLE_AUDIT_PATH,
        outcome: "granted",
        context: { targetUserId, from: result.from, to: result.to },
      });
    }

    return result;
  }

  private deny(
    actor: SetUserRoleInput["actor"],
    targetUserId: number,
    role: UserPermissionRoleDto,
    reason: string
  ) {
    recordAdminDenial({
      actorUserId: actor.id,
      path: SET_USER_ROLE_AUDIT_PATH,
      reason,
      context: { targetUserId, to: role },
    });
  }
}
