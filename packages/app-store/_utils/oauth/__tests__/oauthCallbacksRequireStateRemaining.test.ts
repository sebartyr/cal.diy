import { createHmac } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const axios = Object.assign(vi.fn(), { post: vi.fn() });
  return {
    axios,
    createOAuthAppCredential: vi.fn(),
    storeHuddle01Credential: vi.fn(),
    prisma: {
      user: { findFirstOrThrow: vi.fn(), update: vi.fn() },
      credential: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    },
  };
});

vi.mock("@calcom/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock("axios", () => ({ default: mocks.axios }));
vi.mock("../createOAuthAppCredential", () => ({ default: mocks.createOAuthAppCredential }));
vi.mock("../../getAppKeysFromSlug", () => ({
  default: vi.fn().mockResolvedValue({
    client_id: "client-id",
    client_secret: "client-secret",
    user_agent: "cal-test",
    base_url: "https://tandem.example.com",
  }),
}));
vi.mock("../../getParsedAppKeysFromSlug", () => ({
  default: vi.fn().mockResolvedValue({
    client_id: "client-id",
    client_secret: "client-secret",
    redirect_uris: "https://cal.example.com/api/integrations/dub/callback",
  }),
}));
vi.mock("../../../pipedrive-crm/lib/getPipedriveAppKeys", () => ({
  getPipedriveAppKeys: vi.fn().mockResolvedValue({ client_id: "client-id", client_secret: "client-secret" }),
}));
vi.mock("../../../webex/lib/getWebexAppKeys", () => ({
  getWebexAppKeys: vi.fn().mockResolvedValue({ client_id: "client-id", client_secret: "client-secret" }),
}));
vi.mock("../../../basecamp3/lib/getBasecampKeys", () => ({
  getBasecampKeys: vi.fn().mockResolvedValue({ client_id: "client-id" }),
}));
vi.mock("../../../huddle01video/utils/storage", () => ({
  storeHuddle01Credential: mocks.storeHuddle01Credential,
}));
vi.mock("@calcom/features/auth/lib/getServerSession", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: 42 } }),
}));

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
    session: { user: { id: USER_ID, email: "user@example.com" } },
  } as unknown as NextApiRequest;
}

function sign(nonce: string, userId: number) {
  return createHmac("sha256", NEXTAUTH_SECRET).update(`${nonce}:${userId}`).digest("hex");
}

function signedState(userId: number, extra: Record<string, unknown> = {}) {
  const nonce = "nonce-value";
  return JSON.stringify({ ...extra, nonce, nonceHash: sign(nonce, userId) });
}

type Handler = (req: NextApiRequest, res: NextApiResponse) => unknown;

const callbacks: Array<[string, () => Promise<{ default: Handler }>]> = [
  ["pipedrive-crm", () => import("../../../pipedrive-crm/api/callback")],
  ["zohocrm", () => import("../../../zohocrm/api/callback")],
  ["zoho-bigin", () => import("../../../zoho-bigin/api/callback")],
  ["closecom", () => import("../../../closecom/api/callback")],
  ["intercom", () => import("../../../intercom/api/callback")],
  ["huddle01video", () => import("../../../huddle01video/api/callback")],
  ["basecamp3", () => import("../../../basecamp3/api/callback")],
  ["dub", () => import("../../../dub/api/callback")],
  ["webex", () => import("../../../webex/api/callback")],
  ["tandemvideo", () => import("../../../tandemvideo/api/callback")],
];

const providerQuery = {
  code: "attacker-code",
  identityToken: "attacker-identity-token",
  "accounts-server": "https://accounts.zoho.com",
};

describe("remaining OAuth callbacks refuse to complete without a valid state (SEC-102)", () => {
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
    ["no state", providerQuery],
    ["unsigned state", { ...providerQuery, state: JSON.stringify({ returnTo: "/apps", teamId: 7 }) }],
    ["state signed for another user", { ...providerQuery, state: signedState(USER_ID + 1) }],
  ];

  describe.each(callbacks)("%s", (_slug, load) => {
    it.each(invalidStates)("responds 400 without using the code or token (%s)", async (_label, query) => {
      const { default: handler } = await load();
      const res = makeRes();

      await handler(makeReq(query), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mocks.axios).not.toHaveBeenCalled();
      expect(mocks.axios.post).not.toHaveBeenCalled();
      expect(mocks.createOAuthAppCredential).not.toHaveBeenCalled();
      expect(mocks.storeHuddle01Credential).not.toHaveBeenCalled();
      expect(mocks.prisma.credential.create).not.toHaveBeenCalled();
      expect(mocks.prisma.credential.deleteMany).not.toHaveBeenCalled();
      expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    });
  });

  it("still completes the Webex flow when the state is bound to the current session", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 })
    );
    mocks.prisma.credential.findMany.mockResolvedValue([]);
    const { default: handler } = await import("../../../webex/api/callback");
    const res = makeRes();

    await handler(makeReq({ code: "user-code", state: signedState(USER_ID) }), res);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mocks.createOAuthAppCredential).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledTimes(1);
  });

  it("stores the Huddle01 identityToken when the state is bound to the current session", async () => {
    const { default: handler } = await import("../../../huddle01video/api/callback");
    const res = makeRes();

    await handler(makeReq({ identityToken: "user-token", state: signedState(USER_ID) }), res);

    expect(mocks.storeHuddle01Credential).toHaveBeenCalledWith(USER_ID, "user-token");
    expect(res.redirect).toHaveBeenCalledTimes(1);
  });
});

describe("formerly nonce-exempt /add routes sign the state (SEC-101)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXTAUTH_SECRET", NEXTAUTH_SECRET);
    mocks.prisma.user.findFirstOrThrow.mockResolvedValue({ id: USER_ID });
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  const addRoutes: Array<[string, () => Promise<{ default: Handler }>]> = [
    ["basecamp3", () => import("../../../basecamp3/api/add")],
    ["dub", () => import("../../../dub/api/add")],
    ["webex", () => import("../../../webex/api/add")],
    ["tandemvideo", () => import("../../../tandemvideo/api/add")],
  ];

  it.each(addRoutes)("%s puts a session-bound nonce in the authorize URL", async (_slug, load) => {
    const { default: handler } = await load();
    const res = makeRes();

    await handler(makeReq({ state: JSON.stringify({ returnTo: "/apps/installed", teamId: 7 }) }), res);

    expect(res.json).toHaveBeenCalled();
    const { url } = res.json.mock.calls[0][0] as { url: string };
    const rawState = new URL(url).searchParams.get("state");
    expect(rawState).toBeTruthy();
    const state = JSON.parse(rawState as string);
    expect(state.returnTo).toBe("/apps/installed");
    expect(state.teamId).toBe(7);
    expect(state.nonceHash).toBe(sign(state.nonce, USER_ID));
  });
});

describe("createOAuthAppCredential (SEC-102)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXTAUTH_SECRET", NEXTAUTH_SECRET);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  async function loadActual() {
    const actual = await vi.importActual<typeof import("../createOAuthAppCredential")>(
      "../createOAuthAppCredential"
    );
    return actual.default;
  }

  it.each([
    ["no state", {}],
    ["unsigned state", { state: JSON.stringify({ teamId: 7 }) }],
  ])("refuses to create a credential with %s", async (_label, query) => {
    const createOAuthAppCredential = await loadActual();

    await expect(
      createOAuthAppCredential({ type: "dub", appId: "dub" }, { access_token: "t" }, makeReq(query))
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.prisma.credential.create).not.toHaveBeenCalled();
  });

  it("creates a user credential when the state is bound to the session", async () => {
    const createOAuthAppCredential = await loadActual();

    await createOAuthAppCredential(
      { type: "dub", appId: "dub" },
      { access_token: "t" },
      makeReq({ state: signedState(USER_ID) })
    );

    expect(mocks.prisma.credential.create).toHaveBeenCalledWith({
      data: { type: "dub", key: { access_token: "t" }, userId: USER_ID, appId: "dub" },
    });
  });
});
