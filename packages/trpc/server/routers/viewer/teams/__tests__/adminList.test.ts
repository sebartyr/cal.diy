import { beforeEach, describe, expect, it, vi } from "vitest";

const teamFindMany = vi.fn();

vi.mock("@calcom/prisma", () => ({
  prisma: {
    team: { findMany: (a: unknown) => teamFindMany(a) },
  },
}));

import { adminListHandler } from "../adminList.handler";

const ctx = { user: { id: 1 } as never };

beforeEach(() => {
  teamFindMany.mockReset();
});

describe("adminList (BUG-101-FORK pagination)", () => {
  it("requests take = limit + 1 to detect a next page", async () => {
    teamFindMany.mockResolvedValueOnce([]);
    await adminListHandler({ ctx, input: { limit: 25 } });
    const args = teamFindMany.mock.calls[0][0];
    expect(args.take).toBe(26);
  });

  it("returns nextCursor when an extra row was fetched", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ id: i + 1 }));
    teamFindMany.mockResolvedValueOnce(rows);
    const res = await adminListHandler({ ctx, input: { limit: 50 } });
    expect(res.teams).toHaveLength(50);
    expect(res.nextCursor).toBe(51);
  });

  it("returns nextCursor=null when fewer rows than limit", async () => {
    teamFindMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    const res = await adminListHandler({ ctx, input: { limit: 50 } });
    expect(res.teams).toHaveLength(2);
    expect(res.nextCursor).toBeNull();
  });

  it("passes cursor + skip:1 to prisma when cursor is provided", async () => {
    teamFindMany.mockResolvedValueOnce([]);
    await adminListHandler({ ctx, input: { limit: 50, cursor: 42 } });
    const args = teamFindMany.mock.calls[0][0];
    expect(args.cursor).toEqual({ id: 42 });
    expect(args.skip).toBe(1);
  });

  it("filters isOrganization=false", async () => {
    teamFindMany.mockResolvedValueOnce([]);
    await adminListHandler({ ctx, input: {} });
    const args = teamFindMany.mock.calls[0][0];
    expect(args.where.isOrganization).toBe(false);
  });

  it("applies the search filter when provided", async () => {
    teamFindMany.mockResolvedValueOnce([]);
    await adminListHandler({ ctx, input: { search: "clever" } });
    const args = teamFindMany.mock.calls[0][0];
    expect(args.where.OR).toEqual([
      { name: { contains: "clever", mode: "insensitive" } },
      { slug: { contains: "clever", mode: "insensitive" } },
    ]);
  });
});
