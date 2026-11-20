import { getFeaturesRepository } from "@calcom/features/di/containers/FeaturesRepository";
import type { AppFlags } from "@calcom/features/flags/config";
import { MembershipRepository } from "@calcom/features/membership/repositories/MembershipRepository";
import authedProcedure, { authedAdminProcedure } from "@calcom/trpc/server/procedures/authedProcedure";
import { router } from "@calcom/trpc/server/trpc";
import { z } from "zod";
import { map } from "./map";

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
      const isMember = await new MembershipRepository(ctx.prisma).hasMembership({
        userId: ctx.user.id,
        teamId: input.teamId,
      });
      if (!isMember) return false;

      const featuresRepository = getFeaturesRepository();
      return featuresRepository.checkIfTeamHasFeature(input.teamId, input.feature as keyof AppFlags);
    }),
  map,
});
