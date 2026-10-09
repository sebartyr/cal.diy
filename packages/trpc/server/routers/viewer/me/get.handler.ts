import { getTeamRolePermissionService } from "@calcom/features/membership/di/TeamRolePermissionService.container";
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import { getUserAvatarUrl } from "@calcom/lib/getAvatarUrl";
import prisma from "@calcom/prisma";
import { IdentityProvider, MembershipRole } from "@calcom/prisma/enums";
import { userMetadata } from "@calcom/prisma/zod-utils";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import type { Session } from "next-auth";
import type { TGetInputSchema } from "./get.schema";

type MeOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    session: Session;
  };
  input: TGetInputSchema;
};

type SessionUser = MeOptions["ctx"]["user"];

const hasPasswordAdded = async (user: SessionUser) => {
  if (user.identityProvider === IdentityProvider.CAL) return false;
  const userWithPassword = await prisma.user.findUnique({
    where: {
      id: user.id,
    },
    select: {
      password: true,
    },
  });
  return Boolean(userWithPassword?.password?.hash);
};

const findIdentityProviderEmail = async (user: SessionUser) => {
  if (!user.identityProviderId) return "";
  const account = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider:
          user.identityProvider === IdentityProvider.AZUREAD
            ? "azure-ad"
            : user.identityProvider.toLowerCase(),
        providerAccountId: user.identityProviderId,
      },
    },
    select: { providerEmail: true },
  });
  return account?.providerEmail || "";
};

export const getHandler = async ({ ctx }: MeOptions) => {
  const crypto = await import("node:crypto");

  // ctx.user is already enriched with the profile matching session.upId by getUserFromSession.
  const { user } = ctx;

  // passwordAdded is computed for every caller (not only with includePasswordAdded) so that all views
  // share a single me.get cache entry instead of running the whole handler twice per settings page.
  const [
    allUserEnrichedProfiles,
    secondaryEmails,
    passwordAdded,
    identityProviderEmail,
    teamsWithWritePermission,
  ] = await Promise.all([
    ProfileRepository.findAllProfilesForUserIncludingMovedUser(user),
    prisma.secondaryEmail.findMany({
      where: {
        userId: user.id,
      },
      select: {
        id: true,
        email: true,
        emailVerified: true,
      },
    }),
    hasPasswordAdded(user),
    findIdentityProviderEmail(user),
    getTeamRolePermissionService().getTeamIdsWithPermission({
      userId: user.id,
      permission: "team.update",
      fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
    }),
  ]);

  const userMetadataPrased = userMetadata.parse(user.metadata);

  // Destructuring here only makes it more illegible
  // pick only the part we want to expose in the API

  const profileData = user.organization?.isPlatform
    ? {
        organizationId: null,
        organization: { id: -1, isPlatform: true, slug: "", isOrgAdmin: false },
        username: user.username ?? null,
        profile: ProfileRepository.buildPersonalProfileFromUser({ user }),
        profiles: [],
      }
    : {
        organizationId: user.profile?.organizationId ?? null,
        organization: user.organization,
        username: user.profile?.username ?? user.username ?? null,
        profile: user.profile ?? null,
        profiles: allUserEnrichedProfiles,
        organizationSettings: user?.profile?.organization?.organizationSettings,
      };

  const canUpdateTeams = teamsWithWritePermission.length > 0;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailMd5: crypto.createHash("md5").update(user.email).digest("hex"),
    emailVerified: user.emailVerified,
    bufferTime: user.bufferTime,
    locale: user.locale,
    timeFormat: user.timeFormat,
    timeZone: user.timeZone,
    avatar: getUserAvatarUrl(user),
    avatarUrl: user.avatarUrl,
    createdDate: user.createdDate,
    trialEndsAt: user.trialEndsAt,
    defaultScheduleId: user.defaultScheduleId,
    completedOnboarding: user.completedOnboarding,
    twoFactorEnabled: user.twoFactorEnabled,
    identityProvider: user.identityProvider,
    identityProviderEmail,
    brandColor: user.brandColor,
    darkBrandColor: user.darkBrandColor,
    bio: user.bio,
    weekStart: user.weekStart,
    theme: user.theme,
    appTheme: user.appTheme,
    hideBranding: user.hideBranding,
    metadata: user.metadata,
    defaultBookerLayouts: user.defaultBookerLayouts,
    allowDynamicBooking: user.allowDynamicBooking,
    allowSEOIndexing: user.allowSEOIndexing,
    receiveMonthlyDigestEmail: user.receiveMonthlyDigestEmail,
    requiresBookerEmailVerification: user.requiresBookerEmailVerification,
    ...profileData,
    secondaryEmails,
    isPremium: userMetadataPrased?.isPremium,
    ...(passwordAdded ? { passwordAdded } : {}),
    canUpdateTeams,
  };
};
