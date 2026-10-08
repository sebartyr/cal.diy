import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listTeamsHandler } from "./listTeams.handler";
import { ZAdminListTeamsSchema } from "./listTeams.schema";

describe("admin.listTeams", () => {
  const findMany = vi.fn();
  const prisma = { team: { findMany } } as unknown as PrismaClient;

  const team = (id: number) => ({
    id,
    name: `Team ${id}`,
    slug: `team-${id}`,
    isOrganization: false,
    parent: null,
  });

  beforeEach(() => {
    findMany.mockReset();
  });

  it("searches teams by name or slug, case-insensitively, without platform teams", async () => {
    findMany.mockResolvedValue([team(1)]);

    await listTeamsHandler({
      ctx: { prisma },
      input: ZAdminListTeamsSchema.parse({ searchTerm: "  sales " }),
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isPlatform: false,
          OR: [
            { name: { contains: "sales", mode: "insensitive" } },
            { slug: { contains: "sales", mode: "insensitive" } },
          ],
        },
        take: 21,
      })
    );
  });

  it("paginates with a cursor on the last returned team", async () => {
    findMany.mockResolvedValue([team(1), team(2), team(3)]);

    const result = await listTeamsHandler({
      ctx: { prisma },
      input: ZAdminListTeamsSchema.parse({ limit: 2, cursor: 9 }),
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3, skip: 1, cursor: { id: 9 } }));
    expect(result.rows.map((row) => row.id)).toEqual([1, 2]);
    expect(result.nextCursor).toBe(2);
  });

  it("resolves teams by id", async () => {
    findMany.mockResolvedValue([team(4)]);

    const result = await listTeamsHandler({
      ctx: { prisma },
      input: ZAdminListTeamsSchema.parse({ ids: [4] }),
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isPlatform: false, id: { in: [4] } } })
    );
    expect(result.nextCursor).toBeUndefined();
  });
});
