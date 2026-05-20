import { prisma } from "@calcom/prisma";

import { requireMember } from "./permissions";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { teamId: number };
};

export async function getHandler({ ctx, input }: Options) {
  const membership = await requireMember(ctx.user.id, input.teamId, undefined, ctx.user);

  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: {
      id: true,
      slug: true,
      name: true,
      bio: true,
      logoUrl: true,
      bannerUrl: true,
      brandColor: true,
      darkBrandColor: true,
      theme: true,
      isPrivate: true,
      isOrganization: true,
      hideBranding: true,
      metadata: true,
      createdAt: true,
      _count: {
        select: { members: { where: { accepted: true } }, eventTypes: true },
      },
    },
  });

  if (!team) return null;
  return { ...team, myRole: membership.role };
}
