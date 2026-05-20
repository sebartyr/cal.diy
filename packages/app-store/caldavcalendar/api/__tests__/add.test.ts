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

describe("caldav add (SEC-104)", () => {
  it("refuses a CalDAV URL pointing at cloud-metadata", async () => {
    const { default: handler } = await import("../add");
    const { req, res, status, json } = makeReqRes({
      url: "http://169.254.169.254/dav.php",
      username: "u",
      password: "p",
    });
    await handler(req, res);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("server-side fetch protection") })
    );
  });

  it("refuses a non-HTTP scheme", async () => {
    const { default: handler } = await import("../add");
    const { req, res, status, json } = makeReqRes({
      url: "file:///etc/passwd",
      username: "u",
      password: "p",
    });
    await handler(req, res);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalled();
  });

  it("rejects an empty URL", async () => {
    const { default: handler } = await import("../add");
    const { req, res, status } = makeReqRes({ url: "", username: "u", password: "p" });
    await handler(req, res);
    expect(status).toHaveBeenCalledWith(400);
  });
});
