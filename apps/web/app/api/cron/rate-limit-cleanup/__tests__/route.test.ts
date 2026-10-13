import { PostgresRateLimitStore } from "@calcom/lib/rateLimitStore";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/server", () => ({
  NextRequest: class MockNextRequest {
    url: string;
    method: string;
    nextUrl: { searchParams: URLSearchParams };
    private _headers: Map<string, string>;

    constructor(url: string, options: { method?: string } = {}) {
      this.url = url;
      this.method = options.method || "GET";
      this._headers = new Map();
      this.nextUrl = { searchParams: new URLSearchParams(url.split("?")[1] || "") };
    }

    headers = {
      get: (key: string): string | null => this._headers.get(key.toLowerCase()) || null,
      set: (key: string, value: string): void => {
        this._headers.set(key.toLowerCase(), value);
      },
      has: (key: string): boolean => this._headers.has(key.toLowerCase()),
    };
  },
  NextResponse: {
    json: vi.fn((body, init) => ({
      json: vi.fn().mockResolvedValue(body),
      status: init?.status || 200,
    })),
  },
}));

vi.mock("@calcom/lib/rateLimitStore", () => ({
  PostgresRateLimitStore: { deleteExpired: vi.fn() },
}));
vi.mock("../../../defaultResponderForAppDir", () => ({
  defaultResponderForAppDir: vi.fn((handler) => handler),
}));
vi.mock("@calcom/prisma", () => ({ prisma: {} }));

const deleteExpired = vi.mocked(PostgresRateLimitStore.deleteExpired);

describe("/api/cron/rate-limit-cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_API_KEY", "test-cron-key");
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });

  test("returns 403 when no API key is provided", async () => {
    const request = new NextRequest("http://localhost/api/cron/rate-limit-cleanup");

    const { GET } = await import("../route");
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(403);
    expect(deleteExpired).not.toHaveBeenCalled();
  });

  test("returns 403 when an invalid API key is provided", async () => {
    const request = new NextRequest("http://localhost/api/cron/rate-limit-cleanup");
    request.headers.set("authorization", "invalid-key");

    const { GET } = await import("../route");
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(403);
    expect(deleteExpired).not.toHaveBeenCalled();
  });

  test("reports how many buckets were dropped", async () => {
    deleteExpired.mockResolvedValue(12);
    const request = new NextRequest("http://localhost/api/cron/rate-limit-cleanup");
    request.headers.set("authorization", "test-cron-key");

    const { GET } = await import("../route");
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, deleted: 12 });
  });

  test("returns 500 when the delete fails", async () => {
    deleteExpired.mockRejectedValue(new Error("connection reset"));
    const request = new NextRequest("http://localhost/api/cron/rate-limit-cleanup");
    request.headers.set("authorization", "Bearer test-cron-secret");

    const { GET } = await import("../route");
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.message).toBe("connection reset");
  });
});
