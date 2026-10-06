import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { handleWebhookScheduledTriggers } = vi.hoisted(() => ({
  handleWebhookScheduledTriggers: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextRequest: class MockNextRequest {
    url: string;
    method: string;
    nextUrl: { searchParams: URLSearchParams };
    private _headers: Map<string, string>;

    constructor(url: string, options: { method?: string } = {}) {
      this.url = url;
      this.method = options.method || "POST";
      this._headers = new Map();
      this.nextUrl = { searchParams: new URLSearchParams(url.split("?")[1] || "") };
    }

    headers = {
      get: (key: string): string | null => this._headers.get(key.toLowerCase()) || null,
      set: (key: string, value: string): void => {
        this._headers.set(key.toLowerCase(), value);
      },
    };
  },
  NextResponse: {
    json: vi.fn((body, init) => ({
      json: vi.fn().mockResolvedValue(body),
      status: init?.status || 200,
    })),
  },
}));

vi.mock("@calcom/features/webhooks/lib/handleWebhookScheduledTriggers", () => ({
  handleWebhookScheduledTriggers,
}));
vi.mock("@calcom/prisma", () => ({ default: {} }));

const URL_BASE = "http://localhost/api/cron/webhookTriggers";

async function callRoute(request: NextRequest) {
  const { POST } = await import("../route");
  return POST(request, { params: Promise.resolve({}) });
}

describe("/api/cron/webhookTriggers authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("accepts CRON_API_KEY in the authorization header", async () => {
    vi.stubEnv("CRON_API_KEY", "test-cron-key");
    const request = new NextRequest(URL_BASE);
    request.headers.set("authorization", "test-cron-key");

    const response = await callRoute(request);

    expect(response.status).toBe(200);
    expect(handleWebhookScheduledTriggers).toHaveBeenCalledOnce();
  });

  test("accepts CRON_API_KEY in the apiKey query param", async () => {
    vi.stubEnv("CRON_API_KEY", "test-cron-key");

    const response = await callRoute(new NextRequest(`${URL_BASE}?apiKey=test-cron-key`));

    expect(response.status).toBe(200);
    expect(handleWebhookScheduledTriggers).toHaveBeenCalledOnce();
  });

  test("rejects a wrong key and Bearer CRON_SECRET", async () => {
    vi.stubEnv("CRON_API_KEY", "test-cron-key");
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    const request = new NextRequest(URL_BASE);
    request.headers.set("authorization", "Bearer test-cron-secret");

    expect((await callRoute(request)).status).toBe(401);
    expect((await callRoute(new NextRequest(`${URL_BASE}?apiKey=wrong`))).status).toBe(401);
    expect(handleWebhookScheduledTriggers).not.toHaveBeenCalled();
  });

  test("fails closed when CRON_API_KEY is unset or empty", async () => {
    vi.stubEnv("CRON_API_KEY", undefined);
    expect((await callRoute(new NextRequest(URL_BASE))).status).toBe(401);
    expect((await callRoute(new NextRequest(`${URL_BASE}?apiKey=undefined`))).status).toBe(401);

    vi.stubEnv("CRON_API_KEY", "");
    expect((await callRoute(new NextRequest(`${URL_BASE}?apiKey=`))).status).toBe(401);
    expect(handleWebhookScheduledTriggers).not.toHaveBeenCalled();
  });
});
