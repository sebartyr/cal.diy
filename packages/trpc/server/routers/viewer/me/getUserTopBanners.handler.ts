import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { checkInvalidAppCredentials } from "./checkForInvalidAppCredentials";
import { shouldVerifyEmailHandler } from "./shouldVerifyEmail.handler";

type Props = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
};

export const getUserTopBannersHandler = async ({ ctx }: Props) => {
  const [verifyEmailBanner, invalidAppCredentialBanners] = await Promise.allSettled([
    shouldVerifyEmailHandler({ ctx }),
    checkInvalidAppCredentials({ ctx }),
  ]);

  return {
    teamUpgradeBanner: null,
    orgUpgradeBanner: false,
    verifyEmailBanner: verifyEmailBanner.status === "fulfilled" ? !verifyEmailBanner.value.isVerified : false,
    calendarCredentialBanner: false,
    invalidAppCredentialBanners:
      invalidAppCredentialBanners.status === "fulfilled" ? invalidAppCredentialBanners.value : [],
    dueInvoiceBanner: null,
  };
};
