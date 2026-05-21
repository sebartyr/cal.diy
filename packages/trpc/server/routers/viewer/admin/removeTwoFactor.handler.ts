import { recordAdminAction } from "@calcom/features/audit-log/adminAuditLog";
import { prisma } from "@calcom/prisma";

import type { TrpcSessionUser } from "../../../types";
import type { TAdminRemoveTwoFactor } from "./removeTwoFactor.schema";

type GetOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TAdminRemoveTwoFactor;
};

const removeTwoFactorHandler = async ({ ctx, input }: GetOptions) => {
  const { userId } = input;
  // SEC-305-FORK: 2FA removal is a high-risk admin action — log who/whom.
  recordAdminAction({
    actorUserId: ctx.user.id,
    actorEmail: ctx.user.email,
    path: "viewer.admin.removeTwoFactor",
    outcome: "granted",
    context: { targetUserId: userId },
  });
  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      backupCodes: null,
      twoFactorEnabled: false,
      twoFactorSecret: null,
    },
  });

  return {
    success: true,
    userId,
  };
};

export default removeTwoFactorHandler;
