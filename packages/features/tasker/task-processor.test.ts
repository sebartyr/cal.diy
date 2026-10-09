import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskProcessor } from "./task-processor";

const { mockTask, handlers } = vi.hoisted(() => ({
  mockTask: {
    getNextBatch: vi.fn(),
    succeed: vi.fn(),
    retry: vi.fn(),
  },
  handlers: {
    sendWebhook: vi.fn(),
    webhookDelivery: vi.fn(),
  },
}));

vi.mock("./repository", () => ({ Task: mockTask }));

vi.mock("./tasks", () => ({
  default: {
    sendWebhook: () => Promise.resolve(handlers.sendWebhook),
    webhookDelivery: () => Promise.resolve(handlers.webhookDelivery),
  },
  tasksConfig: {
    webhookDelivery: { minRetryIntervalMins: 5, maxAttempts: 3 },
  },
}));

const makeTask = (index: number, type = "sendWebhook") => ({
  id: `task-${index}`,
  type,
  payload: `{"secret":"payload-${index}"}`,
  attempts: 0,
  maxAttempts: 3,
  lastFailedAttemptAt: null,
});

describe("TaskProcessor.processQueue", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTask.succeed.mockResolvedValue(undefined);
    mockTask.retry.mockResolvedValue(undefined);
    handlers.sendWebhook.mockResolvedValue(undefined);
    handlers.webhookDelivery.mockResolvedValue(undefined);
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    infoSpy.mockRestore();
    vi.useRealTimers();
  });

  it("marks tasks whose handler resolves as succeeded", async () => {
    mockTask.getNextBatch.mockResolvedValue([makeTask(1), makeTask(2)]);

    await new TaskProcessor().processQueue();

    expect(handlers.sendWebhook).toHaveBeenCalledWith('{"secret":"payload-1"}', "task-1");
    expect(mockTask.succeed).toHaveBeenCalledWith("task-1");
    expect(mockTask.succeed).toHaveBeenCalledWith("task-2");
    expect(mockTask.retry).not.toHaveBeenCalled();
  });

  it("retries failed tasks with the configured retry interval", async () => {
    mockTask.getNextBatch.mockResolvedValue([makeTask(1, "webhookDelivery"), makeTask(2)]);
    handlers.webhookDelivery.mockRejectedValue(new Error("boom"));
    handlers.sendWebhook.mockRejectedValue("not an error");

    await new TaskProcessor().processQueue();

    expect(mockTask.retry).toHaveBeenCalledWith({
      taskId: "task-1",
      lastError: "boom",
      minRetryIntervalMins: 5,
    });
    expect(mockTask.retry).toHaveBeenCalledWith({
      taskId: "task-2",
      lastError: "Unknown error",
      minRetryIntervalMins: null,
    });
    expect(mockTask.succeed).not.toHaveBeenCalled();
  });

  it("does not stop the batch when a task type has no handler", async () => {
    mockTask.getNextBatch.mockResolvedValue([makeTask(1, "unknownType"), makeTask(2)]);

    await new TaskProcessor().processQueue();

    expect(mockTask.retry).not.toHaveBeenCalled();
    expect(mockTask.succeed).toHaveBeenCalledTimes(1);
    expect(mockTask.succeed).toHaveBeenCalledWith("task-2");
  });

  it("runs at most 10 handlers at the same time", async () => {
    mockTask.getNextBatch.mockResolvedValue(Array.from({ length: 35 }, (_, index) => makeTask(index)));
    let running = 0;
    let maxRunning = 0;
    handlers.sendWebhook.mockImplementation(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
    });

    await new TaskProcessor().processQueue();

    expect(maxRunning).toBe(10);
    expect(mockTask.succeed).toHaveBeenCalledTimes(35);
  });

  it("leaves unstarted tasks for the next run once the start deadline has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    mockTask.getNextBatch.mockResolvedValue(Array.from({ length: 30 }, (_, index) => makeTask(index)));
    handlers.sendWebhook.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 46 * 1000);
    });

    await new TaskProcessor().processQueue();

    expect(handlers.sendWebhook).toHaveBeenCalledTimes(10);
    expect(mockTask.succeed).toHaveBeenCalledTimes(10);
  });

  it("logs task ids and types but never payloads", async () => {
    mockTask.getNextBatch.mockResolvedValue([makeTask(1)]);

    await new TaskProcessor().processQueue();

    const logged = JSON.stringify(infoSpy.mock.calls);
    expect(logged).toContain("task-1");
    expect(logged).toContain("sendWebhook");
    expect(logged).not.toContain("payload-1");
  });
});
