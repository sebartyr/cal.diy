import { invalidateServerSessionCacheForUser } from "@calcom/features/auth/lib/getServerSession";
import { getUserRoleService } from "@calcom/features/users/di/UserRoleService.container";
import type { TrpcSessionUser } from "../../../types";
import type { TAdminSetUserRoleSchema } from "./setUserRole.schema";

type SetUserRoleOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TAdminSetUserRoleSchema;
};

const setUserRoleHandler = async ({ ctx, input }: SetUserRoleOptions) => {
  const result = await getUserRoleService().setUserRole({
    actor: { id: ctx.user.id, email: ctx.user.email },
    targetUserId: input.userId,
    role: input.role,
  });

  if (result.changed) {
    invalidateServerSessionCacheForUser(result.userId);
  }

  return result;
};

export default setUserRoleHandler;
