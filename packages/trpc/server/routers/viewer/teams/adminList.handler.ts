import { prisma } from "@calcom/prisma";

import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { search?: string };
};

/**
 * System-wide team listing for the admin section. Not gated on Membership —
 * the router exposes this via `authedAdminProcedure`, which enforces the
 * UserPermissionRole.ADMIN check.
 */
export async function adminListHandler({ input }: Options) {
  const teams = await prisma.team.findMany({
    where: {
      isOrganization: false,
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: "insensitive" as const } },
              { slug: { contains: input.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      isPrivate: true,
      createdAt: true,
      _count: {
        select: {
          members: { where: { accepted: true } },
          eventTypes: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return teams;
}
