import type { PrismaClient } from "@calcom/prisma";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleWebhookScheduledTriggers } from "./handleWebhookScheduledTriggers";
import { DEFAULT_WEBHOOK_VERSION } from "./interface/IWebhookRepository";

describe("handleWebhookScheduledTriggers - X-Cal-Webhook-Version header", () => {
  const mockFetch = vi.fn();
  const now = new Date();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("should include X-Cal-Webhook-Version header with webhook version from database", async () => {
    const webhookVersion = "2021-10-20";
    const mockPrisma = {
      webhookScheduledTriggers: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 1,
            jobName: null,
            subscriberUrl: "https://example.com/webhook",
            payload: JSON.stringify({ triggerEvent: "MEETING_ENDED" }),
            startAfter: new Date(now.getTime() - 60000), // 1 minute ago
            webhook: {
              secret: "test-secret",
              version: webhookVersion,
            },
          },
        ]),
      },
      webhook: {
        findUniqueOrThrow: vi.fn(),
      },
    };

    await handleWebhookScheduledTriggers(mockPrisma as unknown as PrismaClient);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];

    expect(url).toBe("https://example.com/webhook");
    expect(options.headers).toHaveProperty("X-Cal-Webhook-Version", webhookVersion);
    expect(options.headers).toHaveProperty("X-Cal-Signature-256");
  });

  it("should use DEFAULT_WEBHOOK_VERSION when webhook has no version", async () => {
    const mockPrisma = {
      webhookScheduledTriggers: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 1,
            jobName: null,
            subscriberUrl: "https://example.com/webhook",
            payload: JSON.stringify({ triggerEvent: "MEETING_STARTED" }),
            startAfter: new Date(now.getTime() - 60000),
            webhook: {
              secret: "test-secret",
              version: null, // No version set
            },
          },
        ]),
      },
      webhook: {
        findUniqueOrThrow: vi.fn(),
      },
    };

    await handleWebhookScheduledTriggers(mockPrisma as unknown as PrismaClient);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];

    expect(options.headers).toHaveProperty("X-Cal-Webhook-Version", DEFAULT_WEBHOOK_VERSION);
  });

  it("should use DEFAULT_WEBHOOK_VERSION when webhook relationship is null", async () => {
    const mockPrisma = {
      webhookScheduledTriggers: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 1,
            jobName: null,
            subscriberUrl: "https://example.com/webhook",
            payload: JSON.stringify({ triggerEvent: "MEETING_STARTED" }),
            startAfter: new Date(now.getTime() - 60000),
            webhook: null, // No webhook relationship
          },
        ]),
      },
      webhook: {
        findUniqueOrThrow: vi.fn(),
      },
    };

    await handleWebhookScheduledTriggers(mockPrisma as unknown as PrismaClient);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];

    expect(options.headers).toHaveProperty("X-Cal-Webhook-Version", DEFAULT_WEBHOOK_VERSION);
  });

  it("should fetch webhook version from database for legacy jobs using jobName", async () => {
    const webhookVersion = "2021-10-20";
    const mockPrisma = {
      webhookScheduledTriggers: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 1,
            jobName: "appId_webhookId123", // Legacy format
            subscriberUrl: "https://example.com/webhook",
            payload: JSON.stringify({ triggerEvent: "MEETING_ENDED" }),
            startAfter: new Date(now.getTime() - 60000),
            webhook: null, // No webhook relationship for legacy jobs
          },
        ]),
      },
      webhook: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          secret: "fetched-secret",
          version: webhookVersion,
        }),
      },
    };

    await handleWebhookScheduledTriggers(mockPrisma as unknown as PrismaClient);

    expect(mockPrisma.webhook.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "webhookId123", appId: "appId" },
      select: { secret: true, version: true },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];

    expect(options.headers).toHaveProperty("X-Cal-Webhook-Version", webhookVersion);
  });
});

describe("handleWebhookScheduledTriggers - batching and delivery", () => {
  const mockFetch = vi.fn();

  const buildJob = (id: number) => ({
    id,
    jobName: null,
    subscriberUrl: `https://example.com/webhook/${id}`,
    payload: JSON.stringify({ triggerEvent: "MEETING_STARTED", id }),
    webhook: { secret: "test-secret", version: "2021-10-20" },
  });

  const buildPrisma = (jobs: ReturnType<typeof buildJob>[]) => ({
    webhookScheduledTriggers: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue(jobs),
    },
    webhook: {
      findUniqueOrThrow: vi.fn(),
    },
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("reads a bounded, oldest-first batch of due jobs", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const mockPrisma = buildPrisma([]);

    await handleWebhookScheduledTriggers(mockPrisma as unknown as PrismaClient);

    expect(mockPrisma.webhookScheduledTriggers.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500, orderBy: { startAfter: "asc" } })
    );
    expect(mockPrisma.webhookScheduledTriggers.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("deletes all run jobs with a single query before sending them", async () => {
    const jobs = [buildJob(1), buildJob(2), buildJob(3)];
    const mockPrisma = buildPrisma(jobs);
    mockFetch.mockImplementation(async () => {
      expect(mockPrisma.webhookScheduledTriggers.deleteMany).toHaveBeenLastCalledWith({
        where: { id: { in: [1, 2, 3] } },
      });
      return { ok: true, status: 200 };
    });

    await handleWebhookScheduledTriggers(mockPrisma as unknown as PrismaClient);

    expect(mockPrisma.webhookScheduledTriggers.deleteMany).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("still deletes jobs whose request fails, without retrying them", async () => {
    const mockPrisma = buildPrisma([buildJob(1), buildJob(2)]);
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED")).mockResolvedValue({ ok: true, status: 200 });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      handleWebhookScheduledTriggers(mockPrisma as unknown as PrismaClient)
    ).resolves.toBeUndefined();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockPrisma.webhookScheduledTriggers.deleteMany).toHaveBeenLastCalledWith({
      where: { id: { in: [1, 2] } },
    });
    consoleError.mockRestore();
  });

  it("waits for every request and runs at most 20 at a time", async () => {
    const jobs = Array.from({ length: 50 }, (_, index) => buildJob(index + 1));
    const mockPrisma = buildPrisma(jobs);
    let inFlight = 0;
    let maxInFlight = 0;
    let completed = 0;
    mockFetch.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      completed++;
      return { ok: true, status: 200 };
    });

    await handleWebhookScheduledTriggers(mockPrisma as unknown as PrismaClient);

    expect(completed).toBe(50);
    expect(maxInFlight).toBe(20);
  });
});
