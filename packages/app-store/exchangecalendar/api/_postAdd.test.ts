import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { buildCalendarServiceMock, credentialCreateMock } = vi.hoisted(() => ({
  buildCalendarServiceMock: vi.fn(),
  credentialCreateMock: vi.fn(),
}));

vi.mock("../lib", () => ({ BuildCalendarService: buildCalendarServiceMock }));
vi.mock("@calcom/prisma", () => ({ default: { credential: { create: credentialCreateMock } } }));
vi.mock("@calcom/lib/crypto", () => ({ symmetricEncrypt: vi.fn().mockReturnValue("encrypted") }));
vi.mock("node:dns/promises", () => ({
  default: { lookup: vi.fn().mockResolvedValue([{ address: "93.184.215.14", family: 4 }]) },
}));

import { getHandler } from "./_postAdd";

const GENERIC_MESSAGE = "Could not add this exchange account";

function createReqRes(url: string) {
  const req = {
    body: { url, username: "user@example.com", password: "secret" },
    session: { user: { id: 1, email: "user@example.com" } },
  } as unknown as NextApiRequest;
  const json = vi.fn();
  const res = { status: vi.fn().mockReturnValue({ json }) } as unknown as NextApiResponse;
  return { req, res, json };
}

describe("exchangecalendar add handler - SSRF protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    "https://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
  ])("rejects %s before contacting the server", async (url) => {
    const { req, res, json } = createReqRes(url);

    await getHandler(req, res);

    expect(buildCalendarServiceMock).not.toHaveBeenCalled();
    expect(credentialCreateMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ message: GENERIC_MESSAGE });
  });

  it("does not leak upstream error messages to the client", async () => {
    buildCalendarServiceMock.mockReturnValue({
      listCalendars: vi.fn().mockRejectedValue(new Error("<html>internal admin panel</html>")),
    });
    const { req, res, json } = createReqRes("https://mail.example.com/EWS/Exchange.asmx");

    await getHandler(req, res);

    expect(buildCalendarServiceMock).toHaveBeenCalledTimes(1);
    expect(json).toHaveBeenCalledWith({ message: GENERIC_MESSAGE });
  });

  it("stores the credential for a public Exchange URL", async () => {
    buildCalendarServiceMock.mockReturnValue({ listCalendars: vi.fn().mockResolvedValue([]) });
    const { req, res, json } = createReqRes("https://mail.example.com/EWS/Exchange.asmx");

    await getHandler(req, res);

    expect(credentialCreateMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ url: "/apps/installed" });
  });
});
