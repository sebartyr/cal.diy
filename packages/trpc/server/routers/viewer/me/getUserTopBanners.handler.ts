import { MembershipRepository } from "@calcom/features/membership/repositories/MembershipRepository";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { checkInvalidAppCredentials } from "./checkForInvalidAppCredentials";
import { shouldVerifyEmailHandler } from "./shouldVerifyEmail.handler";

type Props = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
};

export const getUserTopBannersHandler = async ({ ctx }: Props) => {
  const [verifyEmailBanner, invalidAppCredentialBanners, pendingTeamInvites] = await Promise.allSettled([
    shouldVerifyEmailHandler({ ctx }),
    checkInvalidAppCredentials({ ctx }),
    new MembershipRepository().countPendingByUserId({ userId: ctx.user.id }),
  ]);

  return {
    teamUpgradeBanner: null,
    orgUpgradeBanner: false,
    verifyEmailBanner: verifyEmailBanner.status === "fulfilled" ? !verifyEmailBanner.value.isVerified : false,
    calendarCredentialBanner: false,
    invalidAppCredentialBanners:
      invalidAppCredentialBanners.status === "fulfilled" ? invalidAppCredentialBanners.value : [],
    pendingTeamInvitesBanner: pendingTeamInvites.status === "fulfilled" ? pendingTeamInvites.value : 0,
    dueInvoiceBanner: null,
  };
};
