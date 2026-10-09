import type { PrismaClient } from "@calcom/prisma";
import { prisma } from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";
import type { TaskTypes } from "./tasker";

/** This is a function to ensure new Date is always fresh */
const makeWhereUpcomingTasks = (): Prisma.TaskWhereInput => ({
  // Get only tasks that have not succeeded yet
  succeededAt: null,
  // Get only tasks that are scheduled to run now or in the past
  scheduledAt: {
    lt: new Date(),
  },
  // Get only tasks where maxAttemps has not been reached
  attempts: {
    lt: {
      // @ts-expect-error prisma is tripping: '_ref' does not exist in type 'FieldRef<"Task", "Int">'
      _ref: "maxAttempts",
      _container: "Task",
    },
  },
});

const TASK_BATCH_SIZE = 200;
const CLEANUP_BATCH_SIZE = 5000;
// Bounds a single cleanup run so the first purge of a large backlog doesn't exceed the cron timeout;
// the remaining rows are picked up by the next runs.
const CLEANUP_MAX_BATCHES = 20;

type Dependencies = {
  prismaClient: PrismaClient;
};

export class TaskRepository {
  constructor(private readonly deps: Dependencies) {}

  async create(
    type: TaskTypes,
    payload: string,
    options: { scheduledAt?: Date; maxAttempts?: number; referenceUid?: string } = {}
  ) {
    const { scheduledAt, maxAttempts, referenceUid } = options;
    console.info("Creating task", { type, payload, scheduledAt, maxAttempts });
    const newTask = await this.deps.prismaClient.task.create({
      data: {
        payload,
        type,
        scheduledAt,
        maxAttempts,
        referenceUid,
      },
    });
    return newTask.id;
  }

  async getNextBatch() {
    console.info("Getting next batch of tasks", makeWhereUpcomingTasks());
    return this.deps.prismaClient.task.findMany({
      where: makeWhereUpcomingTasks(),
      orderBy: {
        scheduledAt: "asc",
      },
      take: TASK_BATCH_SIZE,
    });
  }

  async retry({
    taskId,
    lastError,
    minRetryIntervalMins,
  }: {
    taskId: string;
    lastError?: string;
    minRetryIntervalMins?: number | null;
  }) {
    const failedAttemptTime = new Date();
    const updatedScheduledAt = minRetryIntervalMins
      ? new Date(failedAttemptTime.getTime() + 1000 * 60 * minRetryIntervalMins)
      : undefined;

    return this.deps.prismaClient.task.update({
      where: {
        id: taskId,
      },
      data: {
        attempts: { increment: 1 },
        lastError,
        lastFailedAttemptAt: failedAttemptTime,
        ...(updatedScheduledAt && {
          scheduledAt: updatedScheduledAt,
        }),
      },
    });
  }

  async succeed(taskId: string) {
    return this.deps.prismaClient.task.update({
      where: {
        id: taskId,
      },
      data: {
        attempts: { increment: 1 },
        succeededAt: new Date(),
      },
    });
  }

  /**
   * Update the payload of a task
   *
   * @param taskId - The ID of the task to update
   * @param newPayload - The new payload string
   */
  async updatePayload(taskId: string, newPayload: string) {
    return this.deps.prismaClient.task.update({
      where: {
        id: taskId,
      },
      data: {
        payload: newPayload,
      },
    });
  }

  async cancel(taskId: string) {
    return this.deps.prismaClient.task.delete({
      where: {
        id: taskId,
      },
    });
  }

  async cancelWithReference(referenceUid: string, type: TaskTypes): Promise<{ id: string } | null> {
    // prismaClient.task.delete throws an error if the task does not exist, so we catch it and return null
    try {
      return await this.deps.prismaClient.task.delete({
        where: {
          referenceUid_type: {
            referenceUid,
            type,
          },
        },
        select: {
          id: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        // P2025 is the error code for "Record to delete does not exist"
        console.warn(`Task with reference ${referenceUid} and type ${type} does not exist. No action taken.`);
        return null;
      }
      throw error;
    }
  }

  async cleanup({
    succeededBefore,
    failedBefore,
  }: {
    succeededBefore: Date;
    failedBefore: Date;
  }): Promise<number> {
    const where: Prisma.TaskWhereInput = {
      OR: [
        { succeededAt: { lt: succeededBefore } },
        {
          succeededAt: null,
          attempts: { gte: this.deps.prismaClient.task.fields.maxAttempts },
          lastFailedAttemptAt: { lt: failedBefore },
        },
      ],
    };

    let deletedCount = 0;
    for (let batch = 0; batch < CLEANUP_MAX_BATCHES; batch++) {
      const tasks = await this.deps.prismaClient.task.findMany({
        where,
        select: { id: true },
        take: CLEANUP_BATCH_SIZE,
      });
      if (tasks.length === 0) break;

      const { count } = await this.deps.prismaClient.task.deleteMany({
        where: { id: { in: tasks.map((task) => task.id) } },
      });
      deletedCount += count;
      if (tasks.length < CLEANUP_BATCH_SIZE) break;
    }
    return deletedCount;
  }
}

// Export singleton instance for backward compatibility
// This allows existing code using Task.create(), Task.succeed(), etc. to continue working
export const Task = new TaskRepository({ prismaClient: prisma });
