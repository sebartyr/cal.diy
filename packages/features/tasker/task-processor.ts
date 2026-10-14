import { Task } from "./repository";
import tasksMap, { tasksConfig } from "./tasks";

const UNKNOWN_TASK_TYPE_RETRY_INTERVAL_MINS = 60;

// Each handler opens its own Prisma queries and outbound HTTP calls; running a whole batch at once
// exhausts the connection pool and makes handlers time out (P2024).
const TASK_CONCURRENCY = 10;
// The cron runs every minute and there is no claim on fetched tasks, so tasks not started by then are
// left for the next run instead of being picked up twice by overlapping runs.
const START_DEADLINE_MS = 45 * 1000;

type QueuedTask = Awaited<ReturnType<typeof Task.getNextBatch>>[number];

/**
 * TaskProcessor handles the processing of tasks from the queue.
 * This is separated from task creation to avoid importing all task handlers
 * when only creating tasks, which eliminates compilation overhead.
 */
export class TaskProcessor {
  async processQueue(): Promise<void> {
    const startedAt = Date.now();
    const tasks = await Task.getNextBatch();
    console.info(
      `Processing ${tasks.length} tasks`,
      tasks.map((task) => ({ id: task.id, type: task.type }))
    );

    let succeeded = 0;
    const errors: string[] = [];
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < tasks.length && Date.now() - startedAt < START_DEADLINE_MS) {
        const task = tasks[nextIndex++];
        try {
          await this.processTask(task);
          succeeded++;
        } catch (error) {
          errors.push(`${task.id}: ${error}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(TASK_CONCURRENCY, tasks.length) }, worker));

    console.info({
      succeeded,
      failed: errors.length,
      deferred: tasks.length - succeeded - errors.length,
      errors,
    });
  }

  private async processTask(task: QueuedTask): Promise<void> {
    console.info(
      `Processing task ${task.id}, type:${task.type} attempt:${task.attempts} maxAttempts:${task.maxAttempts} lastFailedAttempt:${task.lastFailedAttemptAt}`
    );
    const taskHandlerGetter = tasksMap[task.type as keyof typeof tasksMap];
    if (!taskHandlerGetter) {
      // A type with no handler is either removed from the code (rows queued before the
      // removal) or newer than this instance (rolling deploy). Count it as a failed
      // attempt and push it back: thrown before Task.retry, it stayed at the head of every
      // batch forever and could crowd out the tasks that still work.
      const lastError = `Task handler not found for type ${task.type}`;
      await Task.retry({
        taskId: task.id,
        lastError,
        minRetryIntervalMins: UNKNOWN_TASK_TYPE_RETRY_INTERVAL_MINS,
      });
      throw new Error(lastError);
    }
    const taskConfig = tasksConfig[task.type as keyof typeof tasksConfig];
    const taskHandler = await taskHandlerGetter();
    return taskHandler(task.payload, task.id)
      .then(async () => {
        await Task.succeed(task.id);
      })
      .catch(async (error) => {
        console.info(`Retrying task ${task.id}: ${error}`);
        await Task.retry({
          taskId: task.id,
          lastError: error instanceof Error ? error.message : "Unknown error",
          minRetryIntervalMins:
            taskConfig && "minRetryIntervalMins" in taskConfig ? taskConfig.minRetryIntervalMins : null,
        });
      });
  }
}
