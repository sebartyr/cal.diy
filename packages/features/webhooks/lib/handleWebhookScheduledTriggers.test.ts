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
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
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
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
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
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
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
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
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

  // By default this run claims every job it read; tests override $queryRaw to simulate another run.
  const buildPrisma = (jobs: ReturnType<typeof buildJob>[]) => ({
    $queryRaw: vi.fn().mockResolvedValue(jobs.map((job) => ({ id: job.id }))),
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
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("claims all read jobs with a single DELETE ... RETURNING before sending them", async () => {
    const jobs = [buildJob(1), buildJob(2), buildJob(3)];
    const mockPrisma = buildPrisma(jobs);
    const events: string[] = [];
    mockPrisma.$queryRaw.mockImplementation(async () => {
      events.push("claim");
      return jobs.map((job) => ({ id: job.id }));
    });
    mockFetch.mockImplementation(async () => {
      events.push("fetch");
      return { ok: true, status: 200 };
    });

    await handleWebhookScheduledTriggers(mockPrisma as unknown as PrismaClient);

    expect(events).toEqual(["claim", "fetch", "fetch", "fetch"]);
    const [sql, ids] = mockPrisma.$queryRaw.mock.calls[0];
    expect(sql.join("?")).toMatch(
      /DELETE FROM "WebhookScheduledTriggers" WHERE "id" = ANY\(\?::int\[\]\) RETURNING "id"/
    );
    expect(ids).toEqual([1, 2, 3]);
  });

  it("only sends the jobs this run claimed, not those another overlapping run deleted first", async () => {
    const mockPrisma = buildPrisma([buildJob(1), buildJob(2), buildJob(3)]);
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 2 }]);
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await handleWebhookScheduledTriggers(mockPrisma as unknown as PrismaClient);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("https://example.com/webhook/2");
  });

  it("sends each job once when two runs read the same jobs concurrently", async () => {
    const jobs = [buildJob(1), buildJob(2), buildJob(3)];
    const remaining = new Set(jobs.map((job) => job.id));
    // Mirrors PostgreSQL: a row is returned by at most one of the concurrent deletes.
    const claim = vi.fn(async (_sql: TemplateStringsArray, ids: number[]) => {
      const claimed = ids.filter((id) => remaining.has(id));
      for (const id of claimed) remaining.delete(id);
      return claimed.map((id) => ({ id }));
    });
    const runA = { ...buildPrisma(jobs), $queryRaw: claim };
    const runB = { ...buildPrisma(jobs), $queryRaw: claim };
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await Promise.all([
      handleWebhookScheduledTriggers(runA as unknown as PrismaClient),
      handleWebhookScheduledTriggers(runB as unknown as PrismaClient),
    ]);

    const sentUrls = mockFetch.mock.calls.map(([url]) => url);
    expect(sentUrls.sort()).toEqual(jobs.map((job) => job.subscriberUrl).sort());
  });

  it("does not retry jobs whose request fails", async () => {
    const mockPrisma = buildPrisma([buildJob(1), buildJob(2)]);
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED")).mockResolvedValue({ ok: true, status: 200 });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      handleWebhookScheduledTriggers(mockPrisma as unknown as PrismaClient)
    ).resolves.toBeUndefined();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it("sends every request at once and waits for all of them", async () => {
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
    expect(maxInFlight).toBe(50);
  });
});
