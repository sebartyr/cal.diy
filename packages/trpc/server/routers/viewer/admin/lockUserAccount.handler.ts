import { recordAdminAction } from "@calcom/features/audit-log/adminAuditLog";
import { sendEmailVerification } from "@calcom/features/auth/lib/verifyEmail";
import { GlobalWatchlistRepository } from "@calcom/features/watchlist/lib/repository/GlobalWatchlistRepository";
import { normalizeEmail } from "@calcom/features/watchlist/lib/utils/normalization";
import { prisma } from "@calcom/prisma";
import type { TrpcSessionUser } from "../../../types";
import type { TAdminLockUserAccountSchema } from "./lockUserAccount.schema";

type GetOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TAdminLockUserAccountSchema;
};

const lockUserAccountHandler = async ({ ctx, input }: GetOptions) => {
  const { userId, locked } = input;
  // SEC-305-FORK: rich audit entry tied to the target user.
  recordAdminAction({
    actorUserId: ctx.user.id,
    actorEmail: ctx.user.email,
    path: "viewer.admin.lockUserAccount",
    outcome: "granted",
    context: { targetUserId: userId, locked },
  });

  const user = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      locked,
    },
    select: {
      id: true,
      email: true,
      username: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (!locked) {
    const globalWatchlistRepo = new GlobalWatchlistRepository(prisma);
    const normalizedEmail = normalizeEmail(user.email);
    const watchlistEntry = await globalWatchlistRepo.findBlockedEmail(normalizedEmail);
    if (watchlistEntry) {
      await globalWatchlistRepo.deleteEntry(watchlistEntry.id);
    }

    await sendEmailVerification({
      email: user.email,
      username: user.username || "",
    });
  }

  return {
    success: true,
    userId,
    locked,
  };
};

export default lockUserAccountHandler;
