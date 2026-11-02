import type { NextApiRequest, NextApiResponse } from "next";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadApiV2Handler, apiV2 }: { loadApiV2Handler: Mock; apiV2: Mock } = vi.hoisted(() => ({
  loadApiV2Handler: vi.fn(),
  apiV2: vi.fn(),
}));

vi.mock("@lib/embeddedApiV2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lib/embeddedApiV2")>();
  return { ...actual, loadApiV2Handler };
});

import handler from "../../pages/api/v2/[...path]";

type RequestFixture = { req: NextApiRequest; res: NextApiResponse; status: Mock; json: Mock };

function buildRequest(url: string): RequestFixture {
  const req = { url, method: "GET", query: { path: ["bookings"], take: "10" } };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return {
    req: req as unknown as NextApiRequest,
    res: res as unknown as NextApiResponse,
    status: res.status,
    json: res.json,
  };
}

describe("pages/api/v2/[...path]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    loadApiV2Handler.mockResolvedValue(apiV2);
  });

  it("answers 404 without loading the API when it is not embedded", async () => {
    const { req, res, status } = buildRequest("/api/v2/bookings");

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(404);
    expect(loadApiV2Handler).not.toHaveBeenCalled();
  });

  it("hands the request to the API under its own path, without Next's parsed query", async () => {
    vi.stubEnv("ENABLE_API_V2", "true");
    const { req, res } = buildRequest("/api/v2/bookings?take=10");

    await handler(req, res);

    expect(apiV2).toHaveBeenCalledWith(req, res);
    expect(req.url).toBe("/v2/bookings?take=10");
    expect(Object.hasOwn(req, "query")).toBe(false);
  });

  it("answers 503 when the compiled API cannot be loaded", async () => {
    vi.stubEnv("ENABLE_API_V2", "true");
    loadApiV2Handler.mockRejectedValue(new Error("Cannot find module"));
    const { req, res, status } = buildRequest("/api/v2/bookings");

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(503);
    expect(apiV2).not.toHaveBeenCalled();
  });
});
