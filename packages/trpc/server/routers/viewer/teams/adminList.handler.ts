import { prisma } from "@calcom/prisma";

import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { search?: string; limit?: number; cursor?: number };
};

/**
 * System-wide team listing for the admin section. Not gated on Membership —
 * the router exposes this via `authedAdminProcedure`, which enforces the
 * UserPermissionRole.ADMIN check.
 *
 * BUG-101-FORK (Sprint 4): paginated. Returns up to `limit` rows ordered by
 * createdAt desc, plus a `nextCursor` (the id of an extra fetched row) the
 * client can pass back to continue.
 */
export async function adminListHandler({ input }: Options) {
  const limit = input.limit ?? 50;
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
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });

  let nextCursor: number | null = null;
  if (teams.length > limit) {
    const tail = teams.pop();
    nextCursor = tail?.id ?? null;
  }

  return { teams, nextCursor };
}
