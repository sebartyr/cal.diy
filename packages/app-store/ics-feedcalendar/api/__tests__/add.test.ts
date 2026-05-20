import { describe, expect, it, vi } from "vitest";

vi.mock("@calcom/prisma", () => ({
  default: {
    user: { findFirstOrThrow: vi.fn() },
    credential: { create: vi.fn() },
  },
}));

vi.mock("../../lib", () => ({
  BuildCalendarService: vi.fn(() => ({ listCalendars: vi.fn().mockResolvedValue([]) })),
}));

function makeReqRes(body: Record<string, unknown>) {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();
  return {
    req: { method: "POST", body, session: { user: { id: 1 } } } as never,
    res: { status, json } as never,
    status,
    json,
  };
}

describe("ics-feed add (SEC-104)", () => {
  it("refuses if any URL targets cloud-metadata", async () => {
    const { default: handler } = await import("../add");
    const { req, res, status } = makeReqRes({
      urls: ["https://example.com/ok.ics", "http://169.254.169.254/meta"],
    });
    await handler(req, res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("refuses if urls is missing", async () => {
    const { default: handler } = await import("../add");
    const { req, res, status } = makeReqRes({});
    await handler(req, res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("refuses if urls is empty array", async () => {
    const { default: handler } = await import("../add");
    const { req, res, status } = makeReqRes({ urls: [] });
    await handler(req, res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("refuses a non-string entry", async () => {
    const { default: handler } = await import("../add");
    const { req, res, status } = makeReqRes({ urls: [123, "https://example.com/ok.ics"] });
    await handler(req, res);
    expect(status).toHaveBeenCalledWith(400);
  });
});
