import logger from "@calcom/lib/logger";
import { Task } from "./repository";
import type { Tasker, TaskerCreate, TaskTypes } from "./tasker";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
// Retention is deliberately long: Task rows are only read by the processor, but the
// @@unique([referenceUid, type]) constraint makes a kept row reject a duplicate create for the same reference.
const SUCCEEDED_TASK_RETENTION_DAYS = 30;
// Definitively failed tasks are kept longer so their lastError stays available for investigation.
const FAILED_TASK_RETENTION_DAYS = 90;

/**
 * This is the default internal Tasker that uses the Task repository to create tasks.
 * It doesn't have any external dependencies and is suitable for most use cases.
 * To use a different Tasker, you can create a new class that implements the Tasker interface.
 * Then, you can use the TaskerFactory to select the new Tasker.
 */
export class InternalTasker implements Tasker {
  create: TaskerCreate = async (type, payload, options = {}): Promise<string> => {
    const payloadString = typeof payload === "string" ? payload : JSON.stringify(payload);
    return Task.create(type, payloadString, options);
  };

  async cleanup(): Promise<void> {
    const now = Date.now();
    const count = await Task.cleanup({
      succeededBefore: new Date(now - SUCCEEDED_TASK_RETENTION_DAYS * DAY_IN_MS),
      failedBefore: new Date(now - FAILED_TASK_RETENTION_DAYS * DAY_IN_MS),
    });
    logger.info(`Cleaned up ${count} tasks`);
  }

  async cancel(id: string): Promise<string> {
    const task = await Task.cancel(id);
    return task.id;
  }

  async cancelWithReference(referenceUid: string, type: TaskTypes): Promise<string | null> {
    const task = await Task.cancelWithReference(referenceUid, type);
    return task?.id ?? null;
  }
}
