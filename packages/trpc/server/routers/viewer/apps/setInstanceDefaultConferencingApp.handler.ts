import { getAppFromSlug } from "@calcom/app-store/utils";
import { DeploymentRepository } from "@calcom/features/deployment/repositories/DeploymentRepository";
import type { PrismaClient } from "@calcom/prisma";
import { TRPCError } from "@trpc/server";
import type { TrpcSessionUser } from "../../../types";
import type { TSetInstanceDefaultConferencingAppInputSchema } from "./setInstanceDefaultConferencingApp.schema";

type SetInstanceDefaultConferencingAppOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    prisma: PrismaClient;
  };
  input: TSetInstanceDefaultConferencingAppInputSchema;
};

/**
 * Deployment-wide default, distinct from setDefaultConferencingApp which stores a single
 * user's own pick in their metadata. This one applies to every user who has not picked one.
 */
export const setInstanceDefaultConferencingAppHandler = async ({
  ctx,
  input,
}: SetInstanceDefaultConferencingAppOptions) => {
  const { slug } = input;

  if (slug !== null) {
    const app = getAppFromSlug(slug);

    if (!app) {
      throw new TRPCError({ code: "NOT_FOUND", message: `App ${slug} not found` });
    }

    const isConferencing =
      app.variant === "conferencing" || app.categories?.includes("conferencing") === true;

    if (!isConferencing) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `App ${slug} is not a conferencing app, so it cannot be the default location`,
      });
    }

    // Without a location type the app would resolve to no location at all, producing event
    // types with no location and bookings with no meeting URL.
    if (!app.appData?.location?.type) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `App ${slug} declares no location type` });
    }
  }

  await new DeploymentRepository(ctx.prisma).setDefaultConferencingAppSlug(slug);

  return { slug };
};
