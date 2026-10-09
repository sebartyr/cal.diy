import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskRepository } from "./repository";

vi.mock("@calcom/prisma", () => ({ prisma: {} }));

const maxAttemptsFieldRef = { name: "maxAttempts", modelName: "Task" };

function createPrismaMock() {
  const task = {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    fields: { maxAttempts: maxAttemptsFieldRef },
  };
  return { task, prismaClient: { task } as unknown as PrismaClient };
}

const ids = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) => ({ id: `task-${offset + index}` }));

describe("TaskRepository", () => {
  let mock: ReturnType<typeof createPrismaMock>;
  let repository: TaskRepository;
  const succeededBefore = new Date("2026-09-01T00:00:00.000Z");
  const failedBefore = new Date("2026-07-01T00:00:00.000Z");

  beforeEach(() => {
    mock = createPrismaMock();
    repository = new TaskRepository({ prismaClient: mock.prismaClient });
  });

  describe("getNextBatch", () => {
    it("fetches a bounded batch of due tasks ordered by scheduledAt", async () => {
      mock.task.findMany.mockResolvedValue([]);

      await repository.getNextBatch();

      expect(mock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { scheduledAt: "asc" },
          take: 200,
          where: expect.objectContaining({ succeededAt: null }),
        })
      );
    });
  });

  describe("cleanup", () => {
    it("only targets old succeeded tasks and old definitively failed tasks", async () => {
      mock.task.findMany.mockResolvedValue([]);

      await repository.cleanup({ succeededBefore, failedBefore });

      expect(mock.task.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { succeededAt: { lt: succeededBefore } },
            {
              succeededAt: null,
              attempts: { gte: maxAttemptsFieldRef },
              lastFailedAttemptAt: { lt: failedBefore },
            },
          ],
        },
        select: { id: true },
        take: 5000,
      });
    });

    it("returns 0 without deleting when nothing matches", async () => {
      mock.task.findMany.mockResolvedValue([]);

      const deleted = await repository.cleanup({ succeededBefore, failedBefore });

      expect(deleted).toBe(0);
      expect(mock.task.deleteMany).not.toHaveBeenCalled();
    });

    it("deletes by id in batches until a partial batch is found", async () => {
      mock.task.findMany
        .mockResolvedValueOnce(ids(5000))
        .mockResolvedValueOnce(ids(5000, 5000))
        .mockResolvedValueOnce(ids(12, 10000));
      mock.task.deleteMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({
        count: where.id.in.length,
      }));

      const deleted = await repository.cleanup({ succeededBefore, failedBefore });

      expect(deleted).toBe(10012);
      expect(mock.task.findMany).toHaveBeenCalledTimes(3);
      expect(mock.task.deleteMany).toHaveBeenCalledTimes(3);
      expect(mock.task.deleteMany).toHaveBeenLastCalledWith({
        where: { id: { in: ids(12, 10000).map((task) => task.id) } },
      });
    });

    it("stops after a bounded number of batches so a single run stays short", async () => {
      mock.task.findMany.mockResolvedValue(ids(5000));
      mock.task.deleteMany.mockResolvedValue({ count: 5000 });

      const deleted = await repository.cleanup({ succeededBefore, failedBefore });

      expect(mock.task.findMany).toHaveBeenCalledTimes(20);
      expect(deleted).toBe(100000);
    });
  });
});
