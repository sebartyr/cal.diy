import { meetsSystemAdminPolicy } from "@calcom/features/auth/lib/systemAdminPolicy";
import { getFeaturesRepository } from "@calcom/features/di/containers/FeaturesRepository";
import type { AppFlags } from "@calcom/features/flags/config";
import { MembershipRepository } from "@calcom/features/membership/repositories/MembershipRepository";
import type { PrismaClient } from "@calcom/prisma";
import authedProcedure, { authedAdminProcedure } from "@calcom/trpc/server/procedures/authedProcedure";
import { router } from "@calcom/trpc/server/trpc";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { z } from "zod";
import { map } from "./map";

// Mirrors who may open a team's event types in the editor (getRawEventType): team members, system admins
// meeting the admin policy, and admins of a platform organization for its child teams.
export async function canSeeTeamSettings(
  ctx: { user: NonNullable<TrpcSessionUser>; prisma: PrismaClient },
  teamId: number
): Promise<boolean> {
  if (meetsSystemAdminPolicy(ctx.user)) return true;
  if (await new MembershipRepository(ctx.prisma).hasMembership({ userId: ctx.user.id, teamId })) return true;

  const organizationId = ctx.user.profile?.organizationId;
  if (!ctx.user.organization?.isOrgAdmin || !organizationId) return false;
  const team = await ctx.prisma.team.findUnique({
    where: { id: teamId },
    select: { parentId: true, parent: { select: { isPlatform: true } } },
  });
  return team?.parentId === organizationId && !!team.parent?.isPlatform;
}

export const featureFlagRouter = router({
  // The full list (descriptions, every flag) only feeds the admin flags page.
  list: authedAdminProcedure.query(async () => {
    const featuresRepository = getFeaturesRepository();
    return featuresRepository.getAllFeatures();
  }),
  // Team ids are sequential: a public check let anyone probe which features each team has.
  checkTeamFeature: authedProcedure
    .input(
      z.object({
        teamId: z.number(),
        feature: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!(await canSeeTeamSettings(ctx, input.teamId))) return false;

      const featuresRepository = getFeaturesRepository();
      return featuresRepository.checkIfTeamHasFeature(input.teamId, input.feature as keyof AppFlags);
    }),
  map,
});
