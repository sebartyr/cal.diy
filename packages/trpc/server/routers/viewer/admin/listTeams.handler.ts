import type { PrismaClient } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import type { TAdminListTeamsSchema } from "./listTeams.schema";

type ListTeamsOptions = {
  ctx: {
    prisma: PrismaClient;
  };
  input: TAdminListTeamsSchema;
};

export const listTeamsHandler = async ({ ctx, input }: ListTeamsOptions) => {
  const { limit, cursor, ids } = input;
  const searchTerm = input.searchTerm?.trim();

  const where: Prisma.TeamWhereInput = {
    isPlatform: false,
    ...(ids ? { id: { in: ids } } : {}),
    ...(searchTerm
      ? {
          OR: [
            { name: { contains: searchTerm, mode: "insensitive" } },
            { slug: { contains: searchTerm, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const teams = await ctx.prisma.team.findMany({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      isOrganization: true,
      parent: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  const hasMore = teams.length > limit;
  const rows = hasMore ? teams.slice(0, limit) : teams;

  return {
    rows,
    nextCursor: hasMore ? rows[rows.length - 1].id : undefined,
  };
};

export default listTeamsHandler;
