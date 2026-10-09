import type { PrismaClient } from "@calcom/prisma";
import { describe, expect, it, vi } from "vitest";
import { PrismaOOORepository } from "./PrismaOOORepository";

const buildRepository = () => {
  const findMany = vi.fn().mockResolvedValue([]);
  const prismaClient = { outOfOfficeEntry: { findMany } } as unknown as PrismaClient;
  return { repository: new PrismaOOORepository(prismaClient), findMany };
};

describe("PrismaOOORepository", () => {
  const startTimeDate = new Date("2026-10-08T00:00:00.000Z");
  const endTimeDate = new Date("2026-11-01T00:00:00.000Z");

  it("findManyOOO only fetches entries overlapping the range, bounds included", async () => {
    const { repository, findMany } = buildRepository();

    await repository.findManyOOO({ startTimeDate, endTimeDate, allUserIds: [1, 2] });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toEqual({
      userId: { in: [1, 2] },
      start: { lte: endTimeDate },
      end: { gte: startTimeDate },
    });
  });

  it("findUserOOODays runs the same query for a single user", async () => {
    const { repository, findMany } = buildRepository();

    await repository.findUserOOODays({
      userId: 7,
      dateFrom: startTimeDate.toISOString(),
      dateTo: endTimeDate.toISOString(),
    });
    await repository.findManyOOO({ startTimeDate, endTimeDate, allUserIds: [7] });

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0][0]).toEqual(findMany.mock.calls[1][0]);
    expect(findMany.mock.calls[0][0].select).toEqual({
      id: true,
      start: true,
      end: true,
      notes: true,
      showNotePublicly: true,
      user: { select: { id: true, name: true } },
      toUser: { select: { id: true, username: true, name: true } },
      reason: { select: { id: true, emoji: true, reason: true } },
    });
  });
});
