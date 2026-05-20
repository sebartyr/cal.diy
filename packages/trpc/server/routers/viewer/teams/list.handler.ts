import { prisma } from "@calcom/prisma";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
};

export async function listHandler({ ctx }: Options) {
  const memberships = await prisma.membership.findMany({
    where: { userId: ctx.user.id, team: { isOrganization: false } },
    select: {
      id: true,
      role: true,
      accepted: true,
      team: {
        select: {
          id: true,
          slug: true,
          name: true,
          bio: true,
          logoUrl: true,
          isPrivate: true,
          hideBranding: true,
        },
      },
    },
    orderBy: { team: { name: "asc" } },
  });

  return memberships;
}
