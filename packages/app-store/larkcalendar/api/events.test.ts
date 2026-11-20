// Inbound webhook bodies carry the verification token and app tickets, which must never reach the logs.
import { beforeEach, describe, expect, it, vi } from "vitest";

const debugCalls: unknown[][] = [];

vi.mock("@calcom/lib/logger", () => {
  const capture =
    () =>
    (...args: unknown[]) => {
      debugCalls.push(args);
    };
  return {
    default: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      getSubLogger: () => ({
        debug: capture(),
        info: () => {},
        warn: () => {},
        error: () => {},
      }),
    },
  };
});

const appUpdateMock = vi.fn();

vi.mock("@calcom/prisma", () => ({
  default: {
    app: {
      update: (...args: unknown[]) => appUpdateMock(...args),
    },
  },
}));

vi.mock("../common", () => ({
  getAppKeys: async () => ({ open_verification_token: "VERIFICATION_TOKEN_SECRET" }),
}));

vi.mock("../lib/BotService", () => ({
  sendPostMsg: () => Promise.resolve(),
}));

// Must come after the mocks above.
import handler from "./events";

const buildRes = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    writableEnded: false,
  };
  return res;
};

describe("larkcalendar /api/events logging", () => {
  beforeEach(() => {
    debugCalls.length = 0;
    appUpdateMock.mockReset();
  });

  it("does not log the app_ticket", async () => {
    const req = {
      method: "POST",
      body: {
        token: "VERIFICATION_TOKEN_SECRET",
        event: { type: "app_ticket", app_ticket: "APP_TICKET_SECRET" },
      },
    };

    await handler(req as never, buildRes() as never);

    expect(appUpdateMock).toHaveBeenCalled();
    expect(JSON.stringify(debugCalls)).not.toContain("APP_TICKET_SECRET");
    expect(JSON.stringify(debugCalls)).not.toContain("VERIFICATION_TOKEN_SECRET");
  });

  it("does not log the verification token of a url_verification request", async () => {
    const req = {
      method: "POST",
      body: { type: "url_verification", token: "VERIFICATION_TOKEN_SECRET", challenge: "challenge-value" },
    };
    const res = buildRes();

    await handler(req as never, res as never);

    expect(res.json).toHaveBeenCalledWith({ challenge: "challenge-value" });
    expect(JSON.stringify(debugCalls)).not.toContain("VERIFICATION_TOKEN_SECRET");
  });
});
