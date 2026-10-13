import { createHmac } from "node:crypto";
import process from "node:process";
import type { NextApiRequest, NextApiResponse } from "next";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOAuthAppCredential: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({ default: {}, prisma: {} }));
vi.mock("../createOAuthAppCredential", () => ({ default: mocks.createOAuthAppCredential }));
vi.mock("../../getAppKeysFromSlug", () => ({
  default: vi.fn().mockResolvedValue({
    client_id: "client-id",
    client_secret: "client-secret",
    consumer_key: "consumer-key",
    consumer_secret: "consumer-secret",
    nextcloudTalkHost: "https://nextcloud.example.com",
    nextcloudTalkClientId: "client-id",
    nextcloudTalkClientSecret: "client-secret",
  }),
}));
vi.mock("../../setDefaultConferencingApp", () => ({ default: vi.fn() }));

const NEXTAUTH_SECRET = "test-nextauth-secret";
const USER_ID = 42;

type MockResponse = NextApiResponse & {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
};

function makeRes(): MockResponse {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    redirect: vi.fn(),
    setHeader: vi.fn(),
    writableEnded: false,
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as MockResponse;
}

function makeReq(query: Record<string, string>): NextApiRequest {
  return {
    method: "GET",
    url: "/api/integrations/callback",
    query,
    session: { user: { id: USER_ID } },
  } as unknown as NextApiRequest;
}

function signedState(userId: number) {
  const nonce = "nonce-value";
  const nonceHash = createHmac("sha256", NEXTAUTH_SECRET).update(`${nonce}:${userId}`).digest("hex");
  return JSON.stringify({ nonce, nonceHash });
}

type Handler = (req: NextApiRequest, res: NextApiResponse) => unknown;

const callbacks: Array<[string, () => Promise<{ default: Handler }>]> = [
  ["zohocalendar", () => import("../../../zohocalendar/api/callback")],
  ["office365video", () => import("../../../office365video/api/callback")],
];

describe("OAuth callbacks refuse to exchange a code without a valid state (SEC-102)", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXTAUTH_SECRET", NEXTAUTH_SECRET);
    fetchSpy.mockRejectedValue(new Error("fetch must not be called"));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    fetchSpy.mockRestore();
  });

  const invalidStates: Array<[string, Record<string, string>]> = [
    ["no state", { code: "attacker-code" }],
    ["state without nonce", { code: "attacker-code", state: JSON.stringify({ returnTo: "/apps" }) }],
    ["state signed for another user", { code: "attacker-code", state: signedState(USER_ID + 1) }],
  ];

  describe.each(callbacks)("%s", (_slug, load) => {
    it.each(invalidStates)("responds 400 without exchanging the code (%s)", async (_label, query) => {
      const { default: handler } = await load();
      const res = makeRes();

      await handler(makeReq(query), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mocks.createOAuthAppCredential).not.toHaveBeenCalled();
    });
  });
});
